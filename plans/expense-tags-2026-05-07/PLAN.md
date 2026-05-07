# Expense Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable expense "tags" (snapshot templates with name/category/amount/note/icon/color) so frequent expenses become a one-tap entry on `/expenses`, pre-fill the keypad in `/expense/add`, and link to a future filter UI on both one-off and recurring expenses.

**Architecture:** A new `expense_tags` SQLite table plus a nullable `tag_id` column on both `expenses` and `recurring_expenses`. The expense row continues to store its own snapshot of `category`/`amount`/`note` (current pattern); `tag_id` is the live link used for filtering. Tags are soft-deleted (`is_archived`). A reusable `<TagChipRow>` component renders the chips on both `/expenses` (one-tap mode → `useCreateExpense` + undo toast) and `/expense/add` (pre-fill mode → notifies parent via `onSelect`). Tag CRUD lives in a single `<TagManageModal>`.

**Tech Stack:** Node + Express + TypeScript + `@libsql/client` (SQLite/Turso), React 18 + TypeScript + Vite + TanStack Query + Less + Vitest + `@testing-library/react`.

See [DESIGN.md](./DESIGN.md) for principles + API contract and [RESEARCH.md](./RESEARCH.md) for the code audit underpinning each decision below.

---

## Design Principles (reminder — full set in [DESIGN.md](./DESIGN.md))

1. **One-tap is sacred.** A tag-chip tap on `/expenses` MUST be a single tap → saved expense + undo toast.
2. **Snapshot, not live link.** Editing/deleting a tag never mutates historical expenses.
3. **Soft-delete tags.** `is_archived = 1`; past expenses keep their `tag_id`.
4. **Optional everywhere.** `tag_id` is nullable; existing flows unchanged.
5. **No new patterns.** Reuse `useOptimisticMutation`, `showToast`, `request<T>()`, `trackedExecute`, dynamic-PUT, BEM Less.
6. **Defer the filter UI.** Schema is ready in Phase 1; the UI is a follow-up plan.

---

## Phasing

- **Phase 1 — Backend + types + plumbing.** Schema, tags CRUD route, `tagId` on expense routes, frontend types, API client, hooks. No UI. Manually verified via Swagger.
- **Phase 2 — Tag chip row + one-tap on `/expenses`.** End-to-end vertical slice.
- **Phase 3 — Pre-fill in `/expense/add`, recurring symmetry, "Save as tag" affordance, manage-modal polish.**

One PR per phase — matches the project's prior precedent ([expenses-history-and-budgets-2026-04-17/PLAN.md](../expenses-history-and-budgets-2026-04-17/PLAN.md)).

**Testing note:** The project has no backend test harness today (per the spec, adding one is a separate effort). Backend tasks below verify via `curl` / Swagger UI. Frontend new components ship with Vitest tests, mirroring `day-notes-content.test.tsx`. Run frontend tests with `npm run test --workspace=client` (one-shot) or `npm run test:watch --workspace=client` (watch).

---

# Phase 1 — Backend + plumbing

## Task 1: Schema — `expense_tags` table + `tag_id` columns

**Files:**
- Modify: `server/src/db/index.ts:17-186`

The schema string lives at lines 17-145 of `db/index.ts`; the `initDb()` runner is at lines 148-186 with an existing try/catch block (lines 179-185) where ad-hoc `ALTER`s are appended for forward-compat with existing databases. We add the new table to the `CREATE` block and add two `ALTER`s to the migration block.

- [ ] **Step 1: Append `expense_tags` table to the embedded schema string**

In `server/src/db/index.ts`, find the schema string. Inside it, after the `category_budgets` table block (around line 114) and before the existing indexes block (around line 117), insert:

```sql
-- 5c. Expense Tags (reusable snapshots for frequent expenses)
CREATE TABLE IF NOT EXISTS expense_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    note TEXT,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Then in the indexes block (around lines 130-132 where `idx_expenses_created` etc. live), add:

```sql
CREATE INDEX IF NOT EXISTS idx_expense_tags_archived ON expense_tags(is_archived);
```

- [ ] **Step 2: Append `tag_id` column migrations to the try/catch block**

In `initDb()`, locate the existing migration block (approx. lines 179-185, the one that adds `scheduled_complete_date`). Append two more wrapped `ALTER`s using the same pattern:

```ts
try {
  await db.execute('ALTER TABLE expenses ADD COLUMN tag_id INTEGER');
} catch {
  // already exists
}

try {
  await db.execute('ALTER TABLE recurring_expenses ADD COLUMN tag_id INTEGER');
} catch {
  // already exists
}
```

(Match the exact try/catch shape used by the existing migration — keep style consistent.)

- [ ] **Step 3: Boot the server and verify**

Run: `npm run dev --workspace=server`

Expected: server starts on port 3001 (or `process.env.PORT`) with no schema errors. Logs show no migration errors.

Then verify schema with libsql CLI or any SQLite client (skip if not installed):

```bash
sqlite3 server/data/auditor.db ".schema expense_tags"
sqlite3 server/data/auditor.db "PRAGMA table_info(expenses);"
sqlite3 server/data/auditor.db "PRAGMA table_info(recurring_expenses);"
```

Expected: `expense_tags` table exists; `expenses` and `recurring_expenses` each include a `tag_id INTEGER` column.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat(tags): add expense_tags schema and tag_id columns"
```

---

## Task 2: Backend types — `TagRow`, `tagRowToTag`, extend Expense/Recurring rows

**Files:**
- Modify: `server/src/types.ts` (full file)

- [ ] **Step 1: Add `TagRow`, `Tag`, request types and converter**

In `server/src/types.ts`, after the existing `CategoryBudgetRow` block (around line 51), add:

```ts
export interface TagRow {
  id: number;
  name: string;
  category: string;
  amount: number;
  note: string | null;
  icon: string;
  color: string;
  is_archived: number;
  last_used_at: string | null;
  created_at: string;
}
```

After the existing API-shape `CategoryBudget` interface (around line 130 — wherever camelCase API types live), add:

```ts
export interface Tag {
  id: number;
  name: string;
  category: string;
  amount: number;
  note: string | null;
  icon: string;
  color: string;
  isArchived: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function tagRowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: row.amount,
    note: row.note,
    icon: row.icon,
    color: row.color,
    isArchived: Boolean(row.is_archived),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 2: Extend `ExpenseRow`, `Expense`, `RecurringExpenseRow`, `RecurringExpense`**

Find each of those interfaces and add a nullable `tag_id` (rows) / `tagId` (API):

```ts
// ExpenseRow — add at end:
tag_id: number | null;

// Expense — add at end:
tagId: number | null;

// RecurringExpenseRow — add at end:
tag_id: number | null;

// RecurringExpense — add at end:
tagId: number | null;
```

- [ ] **Step 3: Update converters `expenseRowToExpense` and `recurringExpenseRowToRecurringExpense`**

For each converter, add the new field:

```ts
// expenseRowToExpense return: add
tagId: row.tag_id,

// recurringExpenseRowToRecurringExpense return: add
tagId: row.tag_id,
```

- [ ] **Step 4: TypeCheck**

Run: `npm run build --workspace=server`

Expected: build succeeds with no errors. (Some routes will still send rows without the new field — that's fine because the column is `INTEGER` and SQLite returns `null` for missing columns; the row type is now `tag_id: number | null` which matches.)

- [ ] **Step 5: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(tags): add Tag types and extend Expense types with tagId"
```

---

## Task 3: Backend route — `tags.ts` (CRUD)

**Files:**
- Create: `server/src/routes/tags.ts`

- [ ] **Step 1: Create the tags route file**

Create `server/src/routes/tags.ts` with full CRUD. Match the style of `server/src/routes/budgets.ts` (dynamic SQL build, inline error responses, `trackedExecute` with descriptive `technicalPurpose`).

```ts
import { Router, Request, Response } from 'express';
import { trackedExecute } from '../db/index.js';
import { TagRow, tagRowToTag } from '../types.js';

const router = Router();

/**
 * @openapi
 * /tags:
 *   get:
 *     summary: List tags
 *     tags: [Tags]
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200:
 *         description: Array of tags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Tag' }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === '1';
    const sql = includeArchived
      ? 'SELECT * FROM expense_tags ORDER BY last_used_at DESC, created_at DESC'
      : 'SELECT * FROM expense_tags WHERE is_archived = 0 ORDER BY last_used_at DESC, created_at DESC';
    const result = await trackedExecute(sql, 'listTags');
    const tags = (result.rows as unknown as TagRow[]).map(tagRowToTag);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @openapi
 * /tags/{id}:
 *   get:
 *     summary: Get one tag
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Tag, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       404: { description: Not found }
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [id] },
      'getTagById',
    );
    const row = (result.rows as unknown as TagRow[])[0];
    if (!row) return res.status(404).json({ message: 'Tag not found' });
    res.json(tagRowToTag(row));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @openapi
 * /tags:
 *   post:
 *     summary: Create a tag
 *     tags: [Tags]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateTagRequest' }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       400: { description: Validation error }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category, amount, note, icon, color } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ message: 'category is required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'amount must be a non-negative number' });
    }
    if (typeof icon !== 'string' || icon.length === 0) {
      return res.status(400).json({ message: 'icon is required' });
    }
    if (typeof color !== 'string' || color.length === 0) {
      return res.status(400).json({ message: 'color is required' });
    }
    const result = await trackedExecute(
      {
        sql: `INSERT INTO expense_tags (name, category, amount, note, icon, color)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [name.trim(), category, amount, note ?? null, icon, color],
      },
      'createTag',
    );
    const lookup = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [Number(result.lastInsertRowid)] },
      'getTagAfterCreate',
    );
    res.status(201).json(tagRowToTag((lookup.rows as unknown as TagRow[])[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @openapi
 * /tags/{id}:
 *   put:
 *     summary: Update a tag (also used to restore archived tags via isArchived=false)
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/UpdateTagRequest' } } }
 *     responses:
 *       200: { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       400: { description: Validation error }
 *       404: { description: Not found }
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });

    const { name, category, amount, note, icon, color, isArchived } = req.body ?? {};
    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'name must be non-empty string' });
      }
      sets.push('name = ?'); args.push(name.trim());
    }
    if (category !== undefined) {
      if (typeof category !== 'string' || category.length === 0) {
        return res.status(400).json({ message: 'category must be non-empty string' });
      }
      sets.push('category = ?'); args.push(category);
    }
    if (amount !== undefined) {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'amount must be a non-negative number' });
      }
      sets.push('amount = ?'); args.push(amount);
    }
    if (note !== undefined) { sets.push('note = ?'); args.push(note ?? null); }
    if (icon !== undefined) {
      if (typeof icon !== 'string' || icon.length === 0) {
        return res.status(400).json({ message: 'icon must be non-empty string' });
      }
      sets.push('icon = ?'); args.push(icon);
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || color.length === 0) {
        return res.status(400).json({ message: 'color must be non-empty string' });
      }
      sets.push('color = ?'); args.push(color);
    }
    if (isArchived !== undefined) {
      if (typeof isArchived !== 'boolean') {
        return res.status(400).json({ message: 'isArchived must be boolean' });
      }
      sets.push('is_archived = ?'); args.push(isArchived ? 1 : 0);
    }
    if (sets.length === 0) return res.status(400).json({ message: 'No fields to update' });

    args.push(id);
    const updateResult = await trackedExecute(
      { sql: `UPDATE expense_tags SET ${sets.join(', ')} WHERE id = ?`, args },
      'updateTag',
    );
    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    const lookup = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [id] },
      'getTagAfterUpdate',
    );
    res.json(tagRowToTag((lookup.rows as unknown as TagRow[])[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @openapi
 * /tags/{id}:
 *   delete:
 *     summary: Soft-delete (archive) a tag
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       204: { description: Archived }
 *       404: { description: Not found }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: 'UPDATE expense_tags SET is_archived = 1 WHERE id = ?', args: [id] },
      'archiveTag',
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
```

- [ ] **Step 2: TypeCheck**

Run: `npm run build --workspace=server`

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/tags.ts
git commit -m "feat(tags): add tags CRUD route with soft-delete"
```

---

## Task 4: Mount tags route in `server/src/index.ts`

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Import and mount**

At the top of `server/src/index.ts`, add the import alongside the existing route imports:

```ts
import tagsRouter from './routes/tags.js';
```

After the other `app.use('/api/...', ...)` lines (search for `expensesRouter` to find the cluster), add:

```ts
app.use('/api/tags', tagsRouter);
```

- [ ] **Step 2: Boot and smoke test**

Run: `npm run dev --workspace=server`

Then in another terminal:

```bash
curl -X POST http://localhost:3001/api/tags \
  -H 'Content-Type: application/json' \
  -d '{"name":"Parking work","category":"Transport","amount":12,"note":"Lot near office","icon":"🅿️","color":"#f59e0b"}'
```

Expected: `201` with the created tag JSON (including `id`, `isArchived: false`, `lastUsedAt: null`, ISO `createdAt`).

```bash
curl http://localhost:3001/api/tags
```

Expected: `200` with an array containing the just-created tag.

```bash
curl -X DELETE http://localhost:3001/api/tags/1
```

Expected: `204`. Then `curl http://localhost:3001/api/tags` returns `[]` (archived hidden), and `curl 'http://localhost:3001/api/tags?includeArchived=1'` returns the tag with `isArchived: true`.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(tags): mount /api/tags route"
```

---

## Task 5: Swagger schemas — add Tag, extend Expense

**Files:**
- Modify: `server/src/swagger.ts`

- [ ] **Step 1: Add Tag schemas**

In `server/src/swagger.ts`, locate the `components.schemas` block. After `Expense` / `CreateExpenseRequest` (around line 150-170), add:

```ts
Tag: {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    category: { type: 'string' },
    amount: { type: 'number' },
    note: { type: 'string', nullable: true },
    icon: { type: 'string' },
    color: { type: 'string' },
    isArchived: { type: 'boolean' },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
},
CreateTagRequest: {
  type: 'object',
  required: ['name', 'category', 'amount', 'icon', 'color'],
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'] },
    amount: { type: 'number' },
    note: { type: 'string' },
    icon: { type: 'string' },
    color: { type: 'string' },
  },
},
UpdateTagRequest: {
  type: 'object',
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'] },
    amount: { type: 'number' },
    note: { type: 'string' },
    icon: { type: 'string' },
    color: { type: 'string' },
    isArchived: { type: 'boolean' },
  },
},
```

- [ ] **Step 2: Extend Expense and request schemas with `tagId`**

In the same file, find the `Expense` schema and the `CreateExpenseRequest` schema (around lines 150-170 — the existing definitions), and add to each `properties` object:

```ts
tagId: { type: 'integer', nullable: true },
```

Do the same for `RecurringExpense`, `CreateRecurringExpenseRequest`, and `UpdateRecurringExpenseRequest` if they're defined in this file. (If the file uses JSDoc-style `@openapi` blocks per route instead of a centralized component, leave the route-level updates for the next task — Swagger pulls from both sources.)

- [ ] **Step 3: Verify in Swagger UI**

Reboot the server. Visit `http://localhost:3001/api-docs` (or wherever swagger-ui is mounted; check `server/src/index.ts`). Confirm the `Tag` schema appears and the `tagId` field shows on `Expense`.

- [ ] **Step 4: Commit**

```bash
git add server/src/swagger.ts
git commit -m "feat(tags): add Swagger schemas for Tag and tagId field"
```

---

## Task 6: Extend `expenses.ts` route — accept `tagId`, persist, bump `last_used_at`

**Files:**
- Modify: `server/src/routes/expenses.ts`

- [ ] **Step 1: Accept `tagId` in POST**

In the POST handler (lines ~121-151), replace the current INSERT block. Updated handler:

```ts
router.post('/', async (req, res) => {
  try {
    const { amount, category, note, createdAt, tagId } = req.body ?? {};
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return res.status(400).json({ message: 'amount must be a number' });
    }
    if (typeof category !== 'string' || category.length === 0) {
      return res.status(400).json({ message: 'category is required' });
    }

    let resolvedTagId: number | null = null;
    if (tagId !== undefined && tagId !== null) {
      if (!Number.isInteger(tagId)) {
        return res.status(400).json({ message: 'tagId must be an integer' });
      }
      const tagLookup = await trackedExecute(
        { sql: 'SELECT id, is_archived FROM expense_tags WHERE id = ?', args: [tagId] },
        'validateTagOnExpenseCreate',
      );
      const tagRow = tagLookup.rows[0] as { id: number; is_archived: number } | undefined;
      if (!tagRow || tagRow.is_archived === 1) {
        return res.status(400).json({ message: 'Invalid or archived tagId' });
      }
      resolvedTagId = tagId;
    }

    const result = await trackedExecute(
      {
        sql: `INSERT INTO expenses (amount, category, note, created_at, tag_id)
              VALUES (?, ?, ?, ?, ?)`,
        args: [amount, category, note ?? null, createdAt ?? new Date().toISOString(), resolvedTagId],
      },
      'createExpense',
    );

    if (resolvedTagId !== null) {
      // Best-effort; never fail the request on this.
      trackedExecute(
        { sql: 'UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', args: [resolvedTagId] },
        'updateTagLastUsedAt',
      ).catch(() => {});
    }

    const lookup = await trackedExecute(
      { sql: 'SELECT * FROM expenses WHERE id = ?', args: [Number(result.lastInsertRowid)] },
      'getExpenseAfterCreate',
    );
    res.status(201).json(expenseRowToExpense((lookup.rows as unknown as ExpenseRow[])[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});
```

- [ ] **Step 2: Accept `tagId` in PUT**

In the PUT handler (lines ~190-241), extend the dynamic SQL builder. After the existing `if (createdAt !== undefined) { ... }` block, add:

```ts
if (tagId !== undefined) {
  if (tagId !== null) {
    if (!Number.isInteger(tagId)) {
      return res.status(400).json({ message: 'tagId must be an integer or null' });
    }
    const tagLookup = await trackedExecute(
      { sql: 'SELECT id, is_archived FROM expense_tags WHERE id = ?', args: [tagId] },
      'validateTagOnExpenseUpdate',
    );
    const tagRow = tagLookup.rows[0] as { id: number; is_archived: number } | undefined;
    if (!tagRow || tagRow.is_archived === 1) {
      return res.status(400).json({ message: 'Invalid or archived tagId' });
    }
  }
  sets.push('tag_id = ?');
  args.push(tagId);
}
```

Also extract `tagId` from the destructure at the top of the handler:
```ts
const { amount, category, note, createdAt, tagId } = req.body ?? {};
```

If the update sets `tagId` to a non-null value, also bump `last_used_at` after the UPDATE (mirror the POST best-effort pattern).

- [ ] **Step 3: Smoke test**

Reboot server. Create a tag (Task 4), then:

```bash
curl -X POST http://localhost:3001/api/expenses \
  -H 'Content-Type: application/json' \
  -d '{"amount":12,"category":"Transport","note":"Lot","tagId":1}'
```

Expected: `201` with the expense including `tagId: 1`. Then:

```bash
curl 'http://localhost:3001/api/tags?includeArchived=0'
```

Expected: tag #1 now has a non-null `lastUsedAt`.

```bash
curl -X POST http://localhost:3001/api/expenses \
  -H 'Content-Type: application/json' \
  -d '{"amount":5,"category":"Food","tagId":99999}'
```

Expected: `400 { "message": "Invalid or archived tagId" }`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/expenses.ts
git commit -m "feat(tags): wire tagId through expenses POST/PUT and bump last_used_at"
```

---

## Task 7: Extend `recurringExpenses.ts` — accept `tagId`, propagate in `/generate`

**Files:**
- Modify: `server/src/routes/recurringExpenses.ts`

- [ ] **Step 1: Accept `tagId` on POST and PUT**

In the POST handler (lines ~68-113), apply the same `tagId` validation block as Task 6 Step 1, and include `tag_id` in the INSERT statement:

```ts
const { amount, category, note, recurrenceType, recurrenceDay, tagId } = req.body ?? {};
// ...existing validations...

let resolvedTagId: number | null = null;
if (tagId !== undefined && tagId !== null) {
  if (!Number.isInteger(tagId)) {
    return res.status(400).json({ message: 'tagId must be an integer' });
  }
  const tagLookup = await trackedExecute(
    { sql: 'SELECT id, is_archived FROM expense_tags WHERE id = ?', args: [tagId] },
    'validateTagOnRecurringCreate',
  );
  const tagRow = tagLookup.rows[0] as { id: number; is_archived: number } | undefined;
  if (!tagRow || tagRow.is_archived === 1) {
    return res.status(400).json({ message: 'Invalid or archived tagId' });
  }
  resolvedTagId = tagId;
}

const result = await trackedExecute(
  {
    sql: `INSERT INTO recurring_expenses (amount, category, note, recurrence_type, recurrence_day, tag_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [amount, category, note ?? null, recurrenceType, recurrenceDay, resolvedTagId],
  },
  'createRecurringExpense',
);
```

In the PUT handler (lines ~151-210), extend the dynamic SQL builder with the same `tagId` block from Task 6 Step 2.

- [ ] **Step 2: Propagate `tag_id` in `/generate`**

In the generate handler (lines ~267-327), find the INSERT into `expenses`. Update it to copy `tag_id` from the template:

```ts
await trackedExecute(
  {
    sql: `INSERT INTO expenses (amount, category, note, created_at, tag_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      template.amount,
      template.category,
      template.note,
      todayIso,           // existing variable name; keep what's there
      template.tag_id,    // NEW
    ],
  },
  'createExpenseFromRecurring',
);
```

After the INSERT, if `template.tag_id != null`, fire-and-forget the `last_used_at` bump (same pattern as Task 6).

- [ ] **Step 3: Smoke test**

```bash
# Create a tag and a recurring template referencing it
curl -X POST http://localhost:3001/api/recurring-expenses \
  -H 'Content-Type: application/json' \
  -d '{"amount":50,"category":"Health","recurrenceType":"monthly","recurrenceDay":1,"tagId":1}'

# Force-generate (use today's day for recurrenceDay if needed)
curl -X POST http://localhost:3001/api/recurring-expenses/generate
```

Expected: the generated expense (visible via `GET /api/expenses`) carries `tagId: 1`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/recurringExpenses.ts
git commit -m "feat(tags): wire tagId through recurring expenses and propagate on generate"
```

---

## Task 8: Frontend types — add `Tag` and extend Expense types

**Files:**
- Modify: `client/src/types/index.ts`

- [ ] **Step 1: Add `Tag` interfaces**

After the existing `Budget` types in `client/src/types/index.ts`, add:

```ts
export interface Tag {
  id: number;
  name: string;
  category: string;
  amount: number;
  note: string | null;
  icon: string;
  color: string;
  isArchived: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateTagRequest {
  name: string;
  category: string;
  amount: number;
  note?: string;
  icon: string;
  color: string;
}

export interface UpdateTagRequest {
  name?: string;
  category?: string;
  amount?: number;
  note?: string;
  icon?: string;
  color?: string;
  isArchived?: boolean;
}
```

- [ ] **Step 2: Extend existing types with `tagId`**

Find each of these interfaces (lines 30-36 for Expense, ~42-50 for RecurringExpense, ~153-182 for the requests). Add `tagId?: number | null` to each:

- `Expense` → add `tagId: number | null;` (required field on the read shape)
- `RecurringExpense` → add `tagId: number | null;`
- `CreateExpenseRequest` → add `tagId?: number | null;`
- `UpdateExpenseRequest` → add `tagId?: number | null;`
- `CreateRecurringExpenseRequest` → add `tagId?: number | null;`
- `UpdateRecurringExpenseRequest` → add `tagId?: number | null;`

- [ ] **Step 3: TypeCheck**

Run: `npm run build --workspace=client`

Expected: TypeScript may complain about places that destructure `Expense` and don't supply `tagId` in test fixtures. Fix any failing test fixtures by adding `tagId: null` (e.g., in `day-notes-content.test.tsx`'s `baseLog`-style fixtures if any reference `Expense`).

- [ ] **Step 4: Commit**

```bash
git add client/src/types/index.ts
git commit -m "feat(tags): add frontend Tag types and tagId field on expense shapes"
```

---

## Task 9: Frontend API client — `tagsApi`

**Files:**
- Modify: `client/src/api/client.ts`

- [ ] **Step 1: Add `tagsApi`**

After the existing `recurringExpensesApi` block (around line 226), add:

```ts
export const tagsApi = {
  getAll: (includeArchived?: boolean, purpose?: string) =>
    request<Tag[]>(
      includeArchived ? '/tags?includeArchived=1' : '/tags',
      { purpose },
    ),

  getById: (id: number, purpose?: string) =>
    request<Tag>(`/tags/${id}`, { purpose }),

  create: (data: CreateTagRequest, purpose?: string) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  update: (id: number, data: UpdateTagRequest, purpose?: string) =>
    request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),

  delete: (id: number, purpose?: string) =>
    request<void>(`/tags/${id}`, { method: 'DELETE', purpose }),
};
```

Add the imports at the top of the file alongside existing type imports:

```ts
import type { Tag, CreateTagRequest, UpdateTagRequest } from '@/types';
```

(Or whatever import path the file already uses for `Expense` etc. — match the existing style.)

- [ ] **Step 2: TypeCheck**

Run: `npm run build --workspace=client`

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/client.ts
git commit -m "feat(tags): add tagsApi client"
```

---

## Task 10: Frontend hooks — `useTags`

**Files:**
- Create: `client/src/hooks/useTags.ts`

- [ ] **Step 1: Create the hooks file**

Create `client/src/hooks/useTags.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '@/api/client';
import type { CreateTagRequest, Tag, UpdateTagRequest } from '@/types';
import { showToast } from '@/store/toastStore';

export function useTags(includeArchived = false, purpose?: string) {
  return useQuery({
    queryKey: ['tags', { includeArchived }],
    queryFn: () => tagsApi.getAll(includeArchived, purpose),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagRequest) => tagsApi.create(data, 'Create tag'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not create tag', variant: 'error' });
    },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTagRequest }) =>
      tagsApi.update(id, data, 'Update tag'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not update tag', variant: 'error' });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id, 'Archive tag'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not archive tag', variant: 'error' });
    },
  });
}
```

- [ ] **Step 2: Invalidate `['tags']` from `useCreateExpense` to refresh chip-row order**

Open `client/src/hooks/useExpenses.ts`. In `useCreateExpense` (lines ~37-47), find the `onSuccess` invalidation list and add `['tags']`:

```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['weeklySummary'] });
  qc.invalidateQueries({ queryKey: ['tags'] }); // refresh last_used_at sort
},
```

Apply the same to `useGenerateRecurringExpenses` (lines ~125-135).

- [ ] **Step 3: TypeCheck**

Run: `npm run build --workspace=client`

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useTags.ts client/src/hooks/useExpenses.ts
git commit -m "feat(tags): add useTags hooks and invalidate tags on expense create"
```

---

## Phase 1 Acceptance

- [ ] `expense_tags` table exists; `expenses.tag_id` and `recurring_expenses.tag_id` columns exist.
- [ ] `GET /api/tags`, `POST /api/tags`, `PUT /api/tags/:id`, `DELETE /api/tags/:id` (soft) all work via curl.
- [ ] Creating an expense with `tagId` persists it and bumps the tag's `last_used_at`.
- [ ] Recurring template with `tagId` propagates to generated expenses.
- [ ] `npm run build --workspace=client` and `npm run build --workspace=server` both succeed.
- [ ] Existing tests still pass: `npm run test --workspace=client`.

**Open a PR titled `feat(tags): Phase 1 — schema, API, and frontend plumbing`.**

---

# Phase 2 — Tag chip row + one-tap on `/expenses`

## Task 11: `<TagChipRow>` component

**Files:**
- Create: `client/src/components/tag-chip-row/tag-chip-row.tsx`
- Create: `client/src/components/tag-chip-row/tag-chip-row.less`
- Create: `client/src/components/tag-chip-row/tag-chip-row.test.tsx`
- Create: `client/src/components/tag-chip-row/index.ts`

This task wires both modes (`quick-add` and `prefill`), but `quick-add` is the only one consumed in Phase 2. The `prefill` props are still implemented and unit-tested so Phase 3 can drop in without component changes.

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/tag-chip-row/tag-chip-row.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TagChipRow from './tag-chip-row';
import type { Tag } from '@/types';

vi.mock('@/api/client', () => ({
  tagsApi: {
    getAll: vi.fn(),
  },
  expensesApi: {
    create: vi.fn(),
  },
}));

const sampleTag: Tag = {
  id: 1,
  name: 'Parking',
  category: 'Transport',
  amount: 12,
  note: 'Lot near office',
  icon: '🅿️',
  color: '#f59e0b',
  isArchived: false,
  lastUsedAt: null,
  createdAt: '2026-05-01T08:00:00.000Z',
};

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TagChipRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a chip per non-archived tag', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagChipRow mode="quick-add" />);
    expect(await screen.findByRole('button', { name: /Parking/i })).toBeInTheDocument();
  });

  it('renders empty-state CTA when no tags', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(<TagChipRow mode="quick-add" />);
    expect(await screen.findByRole('button', { name: /Create your first tag/i })).toBeInTheDocument();
  });

  it('mode="prefill" calls onSelect with the tag', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    const onSelect = vi.fn();
    renderWithClient(<TagChipRow mode="prefill" onSelect={onSelect} />);
    const chip = await screen.findByRole('button', { name: /Parking/i });
    await userEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith(sampleTag);
  });

  it('mode="quick-add" calls expensesApi.create with tag snapshot', async () => {
    const { tagsApi, expensesApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    (expensesApi.create as any).mockResolvedValue({ ...sampleTag, id: 99, tagId: 1 });
    renderWithClient(<TagChipRow mode="quick-add" />);
    const chip = await screen.findByRole('button', { name: /Parking/i });
    await userEvent.click(chip);
    await waitFor(() => {
      expect(expensesApi.create).toHaveBeenCalledTimes(1);
    });
    const call = (expensesApi.create as any).mock.calls[0][0];
    expect(call.amount).toBe(12);
    expect(call.category).toBe('Transport');
    expect(call.note).toBe('Lot near office');
    expect(call.tagId).toBe(1);
    expect(typeof call.createdAt).toBe('string');
  });

  it('shows "(taps add to today)" hint when isCurrentMonth=false', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagChipRow mode="quick-add" isCurrentMonth={false} />);
    expect(await screen.findByText(/taps add to today/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run client/src/components/tag-chip-row/tag-chip-row.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tag-chip-row.tsx`**

Create `client/src/components/tag-chip-row/tag-chip-row.tsx`:

```tsx
import { useState } from 'react';
import { useTags } from '@/hooks/useTags';
import { useCreateExpense, useDeleteExpense } from '@/hooks/useExpenses';
import { showToast } from '@/store/toastStore';
import type { Tag } from '@/types';
import TagManageModal from '@/components/tag-manage-modal';
import './tag-chip-row.less';

type CommonProps = {
  isCurrentMonth?: boolean;
};

type QuickAddProps = CommonProps & { mode: 'quick-add' };
type PrefillProps = CommonProps & {
  mode: 'prefill';
  selectedTagId?: number | null;
  onSelect: (tag: Tag | null) => void; // null clears the selection
};

export type TagChipRowProps = QuickAddProps | PrefillProps;

const TagChipRow = (props: TagChipRowProps) => {
  const { data: tags, isLoading } = useTags(false);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageInitialMode, setManageInitialMode] = useState<'list' | 'create'>('list');

  const handleQuickAdd = (tag: Tag) => {
    createExpense.mutate(
      {
        amount: tag.amount,
        category: tag.category,
        note: tag.note ?? undefined,
        tagId: tag.id,
        createdAt: new Date().toISOString(),
      },
      {
        onSuccess: (created) => {
          showToast({
            message: `Logged ₪${tag.amount.toFixed(2)} ${tag.name}`,
            variant: 'info',
            durationMs: 5000,
            action: created
              ? {
                  label: 'Undo',
                  onClick: () => deleteExpense.mutate(created.id),
                }
              : undefined,
          });
        },
      },
    );
  };

  const handleChipClick = (tag: Tag) => {
    if (props.mode === 'quick-add') {
      handleQuickAdd(tag);
    } else if (props.selectedTagId === tag.id) {
      props.onSelect(null);
    } else {
      props.onSelect(tag);
    }
  };

  if (isLoading) {
    return (
      <div className="tag-chip-row">
        <div className="tag-chip-row__skeleton" />
        <div className="tag-chip-row__skeleton" />
        <div className="tag-chip-row__skeleton" />
      </div>
    );
  }

  const hasTags = (tags?.length ?? 0) > 0;

  return (
    <>
      {props.mode === 'quick-add' && props.isCurrentMonth === false && (
        <p className="tag-chip-row__hint">(taps add to today)</p>
      )}
      <div className="tag-chip-row" role="list">
        {!hasTags ? (
          <button
            type="button"
            className="tag-chip-row__empty"
            onClick={() => {
              setManageInitialMode('create');
              setManageOpen(true);
            }}
          >
            + Create your first tag
          </button>
        ) : (
          tags!.map((tag) => {
            const isSelected =
              props.mode === 'prefill' && props.selectedTagId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                role="listitem"
                className={`tag-chip-row__chip${
                  isSelected ? ' tag-chip-row__chip--selected' : ''
                }`}
                style={{ borderColor: tag.color }}
                onClick={() => handleChipClick(tag)}
                aria-label={`${tag.name} ₪${tag.amount.toFixed(2)}`}
              >
                <span
                  className="tag-chip-row__icon"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.icon}
                </span>
                <span className="tag-chip-row__name">{tag.name}</span>
                <span className="tag-chip-row__amount">
                  ₪ {tag.amount.toFixed(2)}
                </span>
              </button>
            );
          })
        )}
        {hasTags && (
          <button
            type="button"
            className="tag-chip-row__manage"
            onClick={() => {
              setManageInitialMode('list');
              setManageOpen(true);
            }}
            aria-label="Manage tags"
          >
            ⚙️
          </button>
        )}
      </div>
      {manageOpen && (
        <TagManageModal
          initialMode={manageInitialMode}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  );
};

export default TagChipRow;
```

- [ ] **Step 4: Implement `index.ts`**

Create `client/src/components/tag-chip-row/index.ts`:

```ts
export { default } from './tag-chip-row';
export type { TagChipRowProps } from './tag-chip-row';
```

- [ ] **Step 5: Implement styles**

Create `client/src/components/tag-chip-row/tag-chip-row.less`:

```less
@import '@/styles/variables.less';

.tag-chip-row {
  display: flex;
  flex-direction: row;
  gap: @space-2;
  overflow-x: auto;
  padding: @space-2 @space-4;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }

  &__hint {
    font-size: 0.75em;
    color: @gray-400;
    margin: 0 @space-4 @space-1;
  }

  &__chip {
    display: flex;
    align-items: center;
    gap: @space-2;
    background: @surface-700;
    border: 0.125em solid transparent;
    border-radius: @radius-full;
    padding: @space-1 @space-3;
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;

    &--selected {
      background: @surface-600;
      box-shadow: 0 0 0 0.125em currentColor;
    }
  }

  &__icon {
    width: 1.5em;
    height: 1.5em;
    border-radius: @radius-full;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
  }

  &__name {
    font-size: 0.875em;
    font-weight: 500;
  }

  &__amount {
    font-size: 0.75em;
    color: @gray-300;
  }

  &__manage,
  &__empty {
    background: @surface-700;
    color: #fff;
    border: 0.0625em dashed @gray-500;
    border-radius: @radius-full;
    padding: @space-1 @space-3;
    cursor: pointer;
    flex-shrink: 0;
    font-size: 0.875em;

    &:hover { background: @surface-600; }
  }

  &__skeleton {
    width: 6em;
    height: 2.25em;
    border-radius: @radius-full;
    background: @surface-700;
    flex-shrink: 0;
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run client/src/components/tag-chip-row/tag-chip-row.test.tsx`

Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tag-chip-row
git commit -m "feat(tags): add TagChipRow component with quick-add and prefill modes"
```

---

## Task 12: `<TagManageModal>` component

**Files:**
- Create: `client/src/components/tag-manage-modal/tag-manage-modal.tsx`
- Create: `client/src/components/tag-manage-modal/tag-manage-modal.less`
- Create: `client/src/components/tag-manage-modal/tag-manage-modal.test.tsx`
- Create: `client/src/components/tag-manage-modal/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/tag-manage-modal/tag-manage-modal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TagManageModal from './tag-manage-modal';
import type { Tag } from '@/types';

vi.mock('@/api/client', () => ({
  tagsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const sampleTag: Tag = {
  id: 1,
  name: 'Parking',
  category: 'Transport',
  amount: 12,
  note: null,
  icon: '🅿️',
  color: '#f59e0b',
  isArchived: false,
  lastUsedAt: null,
  createdAt: '2026-05-01T08:00:00.000Z',
};

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TagManageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list mode shows existing tags with edit and archive controls', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagManageModal initialMode="list" onClose={() => {}} />);
    expect(await screen.findByText('Parking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('create mode validates required fields', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(<TagManageModal initialMode="create" onClose={() => {}} />);
    const save = await screen.findByRole('button', { name: /save/i });
    await userEvent.click(save);
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(tagsApi.create).not.toHaveBeenCalled();
  });

  it('archive button calls tagsApi.delete', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    (tagsApi.delete as any).mockResolvedValue(undefined);
    renderWithClient(<TagManageModal initialMode="list" onClose={() => {}} />);
    await screen.findByText('Parking');
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(tagsApi.delete).toHaveBeenCalledWith(1, expect.any(String));
  });

  it('initialDraft pre-populates create form', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(
      <TagManageModal
        initialMode="create"
        initialDraft={{
          name: 'Coffee',
          category: 'Food',
          amount: 15,
          note: 'Espresso',
          icon: '☕',
          color: '#f97316',
        }}
        onClose={() => {}}
      />,
    );
    const nameInput = await screen.findByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Coffee');
    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('15');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run client/src/components/tag-manage-modal/tag-manage-modal.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tag-manage-modal.tsx`**

Create `client/src/components/tag-manage-modal/tag-manage-modal.tsx`:

```tsx
import { useState } from 'react';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/useTags';
import type { CreateTagRequest, Tag } from '@/types';
import './tag-manage-modal.less';

const CATEGORIES = [
  { id: 'Food', icon: '🍴', color: '#f97316' },
  { id: 'Groceries', icon: '🛒', color: '#3b82f6' },
  { id: 'Transport', icon: '🚌', color: '#f59e0b' },
  { id: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { id: 'Bills', icon: '📄', color: '#64748b' },
  { id: 'Entertainment', icon: '🎮', color: '#a855f7' },
  { id: 'Health', icon: '💊', color: '#10b981' },
  { id: 'Other', icon: '📦', color: '#6b7280' },
] as const;

export type TagManageModalProps = {
  initialMode?: 'list' | 'create' | 'edit';
  initialDraft?: Partial<CreateTagRequest>;
  initialEditId?: number;
  onClose: () => void;
};

type FormState = {
  name: string;
  category: string;
  amount: string;
  note: string;
  icon: string;
  color: string;
};

const draftToForm = (draft: Partial<CreateTagRequest> | undefined): FormState => {
  const cat = draft?.category ?? 'Other';
  const catEntry = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[7];
  return {
    name: draft?.name ?? '',
    category: cat,
    amount: draft?.amount !== undefined ? String(draft.amount) : '',
    note: draft?.note ?? '',
    icon: draft?.icon ?? catEntry.icon,
    color: draft?.color ?? catEntry.color,
  };
};

const tagToForm = (tag: Tag): FormState => ({
  name: tag.name,
  category: tag.category,
  amount: String(tag.amount),
  note: tag.note ?? '',
  icon: tag.icon,
  color: tag.color,
});

const TagManageModal = ({
  initialMode = 'list',
  initialDraft,
  initialEditId,
  onClose,
}: TagManageModalProps) => {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>(initialMode);
  const [editingId, setEditingId] = useState<number | undefined>(initialEditId);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>(() => draftToForm(initialDraft));
  const [error, setError] = useState<string | null>(null);

  const { data: tags } = useTags(showArchived);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const handleCategoryClick = (cat: typeof CATEGORIES[number]) => {
    setForm((f) => ({
      ...f,
      category: cat.id,
      // Re-default icon/color if user hasn't customized them
      icon: f.icon === '' || CATEGORIES.some((c) => c.icon === f.icon) ? cat.icon : f.icon,
      color: f.color === '' || CATEGORIES.some((c) => c.color === f.color) ? cat.color : f.color,
    }));
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = form.name.trim();
    if (!trimmedName) return setError('name is required');
    const amountNum = parseFloat(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) return setError('amount must be a non-negative number');
    if (!form.icon) return setError('icon is required');
    if (!form.color) return setError('color is required');

    const payload = {
      name: trimmedName,
      category: form.category,
      amount: amountNum,
      note: form.note || undefined,
      icon: form.icon,
      color: form.color,
    };

    if (mode === 'edit' && editingId !== undefined) {
      updateTag.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setMode('list') },
      );
    } else {
      createTag.mutate(payload, {
        onSuccess: () => {
          if (initialDraft) onClose();
          else setMode('list');
        },
      });
    }
  };

  const startEdit = (tag: Tag) => {
    setForm(tagToForm(tag));
    setEditingId(tag.id);
    setMode('edit');
    setError(null);
  };

  return (
    <div className="tag-manage-modal__backdrop" onClick={onClose}>
      <div className="tag-manage-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="tag-manage-modal__header">
          <h3>
            {mode === 'list'
              ? 'Manage tags'
              : mode === 'edit'
                ? 'Edit tag'
                : 'New tag'}
          </h3>
          <button
            type="button"
            className="tag-manage-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {mode === 'list' && (
          <div className="tag-manage-modal__body">
            <label className="tag-manage-modal__archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            {(tags ?? []).map((tag) => (
              <div key={tag.id} className="tag-manage-modal__row">
                <span
                  className="tag-manage-modal__row-icon"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.icon}
                </span>
                <span className="tag-manage-modal__row-name">{tag.name}</span>
                <span className="tag-manage-modal__row-meta">
                  {tag.category} · ₪{tag.amount.toFixed(2)}
                </span>
                <button
                  type="button"
                  className="tag-manage-modal__row-edit"
                  onClick={() => startEdit(tag)}
                  aria-label="Edit"
                >
                  ✏️ Edit
                </button>
                {tag.isArchived ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateTag.mutate({ id: tag.id, data: { isArchived: false } })
                    }
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteTag.mutate(tag.id)}
                    aria-label="Archive"
                  >
                    Archive
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="tag-manage-modal__new"
              onClick={() => {
                setForm(draftToForm(undefined));
                setEditingId(undefined);
                setMode('create');
                setError(null);
              }}
            >
              + New tag
            </button>
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <div className="tag-manage-modal__body">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <div className="tag-manage-modal__cat-row">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryClick(c)}
                  className={
                    form.category === c.id
                      ? 'tag-manage-modal__cat tag-manage-modal__cat--active'
                      : 'tag-manage-modal__cat'
                  }
                  style={form.category === c.id ? { backgroundColor: c.color } : undefined}
                  aria-label={c.id}
                >
                  {c.icon}
                </button>
              ))}
            </div>
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label>
              Note
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <label>
              Icon
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                maxLength={4}
              />
            </label>
            <label>
              Color
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#RRGGBB"
              />
            </label>
            {error && <p className="tag-manage-modal__error">{error}</p>}
            <div className="tag-manage-modal__actions">
              <button type="button" onClick={() => setMode('list')}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={createTag.isPending || updateTag.isPending}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagManageModal;
```

- [ ] **Step 4: Implement `index.ts`**

Create `client/src/components/tag-manage-modal/index.ts`:

```ts
export { default } from './tag-manage-modal';
export type { TagManageModalProps } from './tag-manage-modal';
```

- [ ] **Step 5: Implement styles**

Create `client/src/components/tag-manage-modal/tag-manage-modal.less`:

```less
@import '@/styles/variables.less';

.tag-manage-modal {
  &__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: @space-4;
  }

  &__card {
    background: @surface-800;
    border-radius: @radius-3xl;
    width: 100%;
    max-width: 28em;
    max-height: 90vh;
    overflow-y: auto;
    color: #fff;
    box-shadow: 0 1.5625em 3.125em -0.75em rgba(0, 0, 0, 0.25);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: @space-4;
    border-bottom: 0.0625em solid @surface-700;

    h3 { margin: 0; }
  }

  &__close {
    background: transparent;
    color: #fff;
    border: none;
    font-size: 1.25em;
    cursor: pointer;
  }

  &__body {
    padding: @space-4;
    display: flex;
    flex-direction: column;
    gap: @space-3;

    label {
      display: flex;
      flex-direction: column;
      gap: @space-1;
      font-size: 0.875em;
      color: @gray-300;

      input[type='text'],
      input[type='number'] {
        background: @surface-700;
        color: #fff;
        border: 0.0625em solid @surface-600;
        border-radius: @radius-lg;
        padding: @space-2 @space-3;
      }
    }
  }

  &__archive-toggle {
    flex-direction: row !important;
    align-items: center;
    gap: @space-2;
  }

  &__cat-row {
    display: flex;
    flex-wrap: wrap;
    gap: @space-1;
  }

  &__cat {
    width: 2.5em;
    height: 2.5em;
    border-radius: @radius-full;
    background: @surface-700;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 1.1em;

    &--active { box-shadow: 0 0 0 0.125em #fff; }
  }

  &__row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    gap: @space-2;
    align-items: center;
    padding: @space-2;
    border-bottom: 0.0625em solid @surface-700;

    button {
      background: @surface-700;
      color: #fff;
      border: none;
      border-radius: @radius-lg;
      padding: @space-1 @space-2;
      cursor: pointer;
      font-size: 0.75em;
    }
  }

  &__row-icon {
    width: 1.75em;
    height: 1.75em;
    border-radius: @radius-full;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__row-meta {
    color: @gray-400;
    font-size: 0.75em;
  }

  &__new {
    margin-top: @space-2;
    padding: @space-2;
    background: @surface-700;
    color: #fff;
    border: 0.0625em dashed @gray-500;
    border-radius: @radius-lg;
    cursor: pointer;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: @space-2;

    button {
      padding: @space-2 @space-4;
      border-radius: @radius-lg;
      border: none;
      cursor: pointer;
      background: @surface-700;
      color: #fff;

      &:last-child { background: @blue-500; }
    }
  }

  &__error {
    color: #ef4444;
    font-size: 0.875em;
    margin: 0;
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run client/src/components/tag-manage-modal/tag-manage-modal.test.tsx`

Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tag-manage-modal
git commit -m "feat(tags): add TagManageModal with create, edit, archive, restore"
```

---

## Task 13: Mount `<TagChipRow>` on `/expenses`

**Files:**
- Modify: `client/src/views/expenses-view/expenses-view.tsx`
- Modify: `client/src/views/expenses-view/expenses-view.less` (only if a wrapper class is added)

- [ ] **Step 1: Render the chip row**

In `client/src/views/expenses-view/expenses-view.tsx`, import the component near the existing imports:

```tsx
import TagChipRow from '@/components/tag-chip-row';
```

Then, in the JSX, locate the controls block at lines ~247-270 (the `[Timeline / By Category]` toggle + `+ Add` button row). Immediately AFTER that block (and BEFORE the `viewMode === 'timeline' ? ... : ...` switch), add:

```tsx
<TagChipRow mode="quick-add" isCurrentMonth={isCurrentMonth} />
```

`isCurrentMonth` is already a destructured value from the existing `useMemo` at lines ~66-78. No new state needed.

- [ ] **Step 2: Manual verification — happy path**

Run frontend + backend dev servers:

```bash
npm run dev
```

Visit `http://localhost:5173/expenses`. With at least one tag created (use the chip-row's "+ Create your first tag" button, or seed one via curl from Task 4):

- The chip row appears above the timeline.
- Tapping a chip immediately adds an expense to today (visible in the timeline list).
- A toast appears with an "Undo" button. Tapping "Undo" removes the just-added expense.
- Navigating to a previous month shows the "(taps add to today)" hint above the chip row.
- Tapping a chip while viewing a past month still adds the expense to today (verify by clicking back to current month).

- [ ] **Step 3: Manual verification — empty + manage**

- Archive all tags via the manage modal (or `curl -X DELETE`). Verify the chip row collapses to "+ Create your first tag".
- Click that button. The manage modal opens in create mode. Save a new tag. Verify the chip appears in the row.
- Click "⚙️" on a populated chip row. Verify the manage modal opens in list mode.

- [ ] **Step 4: Run all frontend tests**

Run: `npm run test --workspace=client`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/expenses-view/expenses-view.tsx client/src/views/expenses-view/expenses-view.less
git commit -m "feat(tags): mount tag chip row on /expenses with one-tap add"
```

---

## Phase 2 Acceptance

- [ ] One-tap chip add creates an expense with `tagId` set, dated to today.
- [ ] Undo toast successfully removes the expense.
- [ ] Manage modal supports create / edit / archive / restore round-trip.
- [ ] Chip row sorts by `last_used_at DESC` (verified by tapping different chips and refreshing — most recent floats to the front).
- [ ] Empty state shows "+ Create your first tag" CTA.
- [ ] All Vitest tests pass.

**Open a PR titled `feat(tags): Phase 2 — chip row and one-tap on /expenses`.**

---

# Phase 3 — Pre-fill, recurring symmetry, "Save as tag"

## Task 14: Pre-fill in `/expense/add`

**Files:**
- Modify: `client/src/views/expense-quick-add/expense-quick-add.tsx`
- Modify: `client/src/views/expense-quick-add/expense-quick-add.less` (minor, possibly none)

- [ ] **Step 1: Add `tagId` state and import the chip row**

At the top of `client/src/views/expense-quick-add/expense-quick-add.tsx`, add:

```tsx
import TagChipRow from '@/components/tag-chip-row';
```

Inside the component body, add a new state hook alongside the existing ones (next to `note`):

```ts
const [tagId, setTagId] = useState<number | null>(null);
```

In the existing `useExpense(expenseId)` data-loading effect (where the form is hydrated in edit mode — search for `setAmount(String(expense.amount))` or similar), also set `setTagId(expense.tagId)` if the loaded expense has one.

- [ ] **Step 2: Render the chip row in prefill mode**

Locate the category scroll JSX block (lines ~168-196 of the existing file). Immediately AFTER that block, insert:

```tsx
<TagChipRow
  mode="prefill"
  selectedTagId={tagId}
  onSelect={(tag) => {
    if (tag === null) {
      setTagId(null);
      return;
    }
    setTagId(tag.id);
    setAmount(String(tag.amount));
    setCategory(tag.category as CategoryId);
    setNote(tag.note ?? '');
  }}
/>
```

The `as CategoryId` cast is safe because the server validates category against the same 8 strings on tag create (see Task 3 + the swagger enum). If TS doesn't accept it, widen `category` state type to `string`.

- [ ] **Step 3: Pass `tagId` in all three submit branches**

In `handleSubmit` (lines ~86-109), update each `mutate` call to include `tagId`:

```ts
if (isRecurring && !isEditMode) {
  createRecurringExpense.mutate(
    {
      amount: parsedAmount,
      category,
      note: note || undefined,
      recurrenceType,
      recurrenceDay,
      tagId: tagId ?? undefined,
    },
    { onSuccess: () => navigate(-1) },
  );
} else if (isEditMode && expenseId) {
  updateExpense.mutate(
    {
      id: expenseId,
      data: {
        amount: parsedAmount,
        category,
        note: note || undefined,
        createdAt: selectedDate.toISOString(),
        tagId: tagId,  // can be null to clear
      },
    },
    { onSuccess: () => navigate(-1) },
  );
} else {
  createExpense.mutate(
    {
      amount: parsedAmount,
      category,
      note: note || undefined,
      createdAt: selectedDate.toISOString(),
      tagId: tagId ?? undefined,
    },
    { onSuccess: () => navigate(-1) },
  );
}
```

- [ ] **Step 4: Manual verification**

Run dev servers. Navigate to `/expense/add`:
- Tap a chip → keypad amount, category, and note populate from the tag.
- Override the amount → submit → verify saved expense has the user-typed amount and the original tag's `tagId`.
- Tap the same chip again → selection clears (visual highlight removed; user-typed amount/category/note preserved).
- In edit mode (`/expense/edit/<id>` for an expense with a `tagId`), the chip is highlighted on entry.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/expense-quick-add/expense-quick-add.tsx client/src/views/expense-quick-add/expense-quick-add.less
git commit -m "feat(tags): pre-fill quick-add keypad from tag chip selection"
```

---

## Task 15: "Save as tag" affordance

**Files:**
- Modify: `client/src/views/expense-quick-add/expense-quick-add.tsx`

- [ ] **Step 1: Add the button + modal state**

In `expense-quick-add.tsx`, add new state near the existing modal-toggle states:

```ts
const [saveAsTagOpen, setSaveAsTagOpen] = useState(false);
```

Import the modal:

```tsx
import TagManageModal from '@/components/tag-manage-modal';
```

In the JSX, below the notes input (find `<input ... className="expense-quick-add__notes-input" />` around line 254-260), and only when `!isEditMode`, render:

```tsx
{!isEditMode && (
  <button
    type="button"
    className="expense-quick-add__save-as-tag"
    onClick={() => setSaveAsTagOpen(true)}
    disabled={parseFloat(amount) <= 0}
  >
    💾 Save as tag
  </button>
)}
```

At the end of the component (next to the existing `<DatePickerModal>` and `<RecurringOptionsModal>` blocks), conditionally render:

```tsx
{saveAsTagOpen && (
  <TagManageModal
    initialMode="create"
    initialDraft={{
      name: note || category,
      category,
      amount: parseFloat(amount) || 0,
      note: note || undefined,
      icon: selectedCat.icon,
      color: selectedCat.color,
    }}
    onClose={() => setSaveAsTagOpen(false)}
  />
)}
```

- [ ] **Step 2: Style the new button**

Append to `expense-quick-add.less`:

```less
&__save-as-tag {
  align-self: center;
  margin-top: @space-2;
  background: @surface-700;
  color: #fff;
  border: none;
  border-radius: @radius-full;
  padding: @space-1 @space-3;
  font-size: 0.75em;
  cursor: pointer;

  &:hover:not(:disabled) { background: @surface-600; }
  &:disabled { opacity: 0.4; cursor: default; }
}
```

- [ ] **Step 3: Manual verification**

- In `/expense/add`, type an amount and a note. Tap "💾 Save as tag". The manage modal opens in create mode with name, category, amount, note pre-filled.
- Save the tag. Verify it appears in the chip row above (refetch may take a moment because the modal closes, the chip row is mounted in the same view, and `useTags` re-runs on mount).
- In edit mode (`/expense/edit/<id>`), confirm the "Save as tag" button is hidden.
- Confirm the button is disabled when amount is 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/expense-quick-add
git commit -m "feat(tags): add Save as tag affordance in quick-add"
```

---

## Task 16: Recurring tag UI parity (optional polish)

**Files:**
- Modify: `client/src/views/expense-quick-add/recurring-options-modal.tsx` (if recurring expenses need a tag selector — see decision below)

The backend already accepts `tagId` on recurring templates (Task 7), and the quick-add submit flow in Task 14 already passes `tagId` into `createRecurringExpense.mutate`. So if the user pre-fills from a tag and toggles recurring, the recurring template will be created with that `tagId`. **No additional UI is required for the common path.**

The only gap is: there's no UI to set a tag on an *already-created* recurring template, since the project has no recurring-list view today. Skip this task unless a recurring-list view ships in another plan; the schema and API are forward-compatible.

- [ ] **Step 1: Verify the implicit flow works**

In `/expense/add`:
1. Tap a tag chip (pre-fills amount/category/note/tagId).
2. Toggle the recurring switch on, pick a schedule, save.
3. Expected: the recurring template (visible via `curl http://localhost:3001/api/recurring-expenses`) carries the chosen `tagId`.
4. Run `curl -X POST http://localhost:3001/api/recurring-expenses/generate` (forcing the recurrence-day match if needed by editing the template's `recurrence_day` to today's day-of-month/week first).
5. The generated expense has the same `tagId`.

- [ ] **Step 2: No commit needed** (this task is verification-only).

---

## Task 17: Final regression sweep

- [ ] **Step 1: Run all tests**

```bash
npm run test --workspace=client
npm run build --workspace=client
npm run build --workspace=server
```

Expected: all green.

- [ ] **Step 2: Manual smoke**

Visit each affected screen and confirm nothing regressed:
- `/` (pulse-dashboard) — unchanged.
- `/expenses` — chip row visible, timeline unchanged, by-category unchanged.
- `/expense/add` — chip row + pre-fill + save-as-tag work; date picker + recurring still work.
- `/expense/edit/<id>` — loads tag selection if set; "Save as tag" button hidden.

- [ ] **Step 3: Commit any small fixes you found**

```bash
git add <files>
git commit -m "fix(tags): <what>"
```

---

## Phase 3 Acceptance

- [ ] Tapping a tag chip in `/expense/add` pre-fills amount, category, note, and `tagId`.
- [ ] Re-tapping the selected chip clears the selection.
- [ ] Edit mode loads existing `tagId` and highlights the chip.
- [ ] "Save as tag" button creates a tag from the current form values, hidden in edit mode.
- [ ] A recurring template created from a tag-prefilled form propagates `tagId` to generated expenses.
- [ ] All Vitest tests pass; both builds succeed.

**Open a PR titled `feat(tags): Phase 3 — quick-add pre-fill, save-as-tag, recurring symmetry`.**

---

## Out of Scope (reminder from DESIGN.md)

- Filter UI on `/expenses`. Schema is ready; UI is a follow-up plan.
- Bulk-tagging existing historical expenses.
- Multiple tags per expense.
- Tag groups / hierarchies.
- Tags in `<QuickAddModal>` (the mini-FAB modal).
- Backend test harness — manual + frontend tests only for now.
- Tag analytics / dashboard.
