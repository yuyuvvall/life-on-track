# Editable Expense Categories — Plan

**Date:** 2026-05-08
**Goal:** Replace the four hard-coded category lists with a user-editable `categories` table. Migrate every existing row that references a category by string. Make category cards in the By Category view clickable, drilling into a filtered timeline for that category.

See [RESEARCH.md](./RESEARCH.md) for the audit and design rationale behind each decision.

---

## Principles

1. **`category_id` is the source of truth.** Live link, not snapshot — renames apply everywhere immediately. (This is the headline feature.)
2. **Soft-delete, never hard-delete.** Archived categories vanish from pickers but keep historical FKs valid. Mirrors `expense_tags`.
3. **Reuse existing patterns.** `useOptimisticMutation`, `request<T>()`, `showToast`, the manage-modal shape from `<TagManageModal>`.
4. **One-shot, idempotent migration.** Lives in `initDb()`'s try/catch ALTER block. Safe to re-run on every boot.
5. **Defer cosmetic cleanup.** Phase 1 ships behind the existing UI by replacing hard-coded constants with API-backed data. Phase 2 makes it interactive. Phase 3 ships the management modal. Phase 4 wires up the drill-down.

## Phasing

| Phase | Scope | Verification |
|---|---|---|
| **1** | Schema + migration + types + read API + `useCategories` hook. **No UI changes yet** — but every consumer of the hard-coded constants is rewritten to read from the hook. | Manual: existing app continues to render correctly with categories sourced from DB. |
| **2** | Backend `?categoryId=` filter on `GET /expenses`. Wire up category cards in By Category view to navigate to filtered timeline. | Click a card → see only that category's expenses; back button returns to By Category. |
| **3** | Full CRUD API (create/update/archive/reorder) + `<CategoryManageModal>` UI. Replace BEM CSS modifiers with data-driven inline styles. | Add, rename, recolor, archive a category from the modal; verify the change is reflected on the timeline and By Category view. |
| **4** | Cleanup: drop the legacy `category TEXT` columns; remove `EXPENSE_CATEGORIES` type and any leftover hard-coded references. | `grep -r "EXPENSE_CATEGORIES\|CATEGORY_ICONS\|CATEGORY_MODIFIER"` returns zero hits. |

One PR per phase, matching project precedent.

---

# Phase 1 — Schema, migration, read API, frontend plumbing

## Task 1: Schema — `categories` table + `category_id` columns

**File:** `server/src/db/index.ts`

- [ ] **Step 1: Add `categories` table to the embedded schema string**

  After the `expense_tags` block (around line 140), insert:

  ```sql
  -- 5d. Expense Categories (user-editable; replaces hard-coded frontend list)
  CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_categories_archived ON categories(is_archived, sort_order);
  ```

  > `is_system = 1` is reserved for the seeded "Other" category and prevents archive/rename via the API. See Task 8.

- [ ] **Step 2: Add nullable `category_id` columns via the migration try/catch block**

  In the `initDb()` migration block, add:

  ```ts
  try { await db.execute('ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)'); } catch {}
  try { await db.execute('ALTER TABLE recurring_expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)'); } catch {}
  try { await db.execute('ALTER TABLE category_budgets ADD COLUMN category_id INTEGER REFERENCES categories(id)'); } catch {}
  try { await db.execute('ALTER TABLE expense_tags ADD COLUMN category_id INTEGER REFERENCES categories(id)'); } catch {}
  ```

  > **Note:** SQLite does not enforce FK constraints added via `ALTER`, but the column declaration documents intent. We rely on application code to maintain integrity.

## Task 2: Seed defaults + back-fill `category_id` (the migration script)

**File:** `server/src/db/index.ts` — extend `initDb()`.

- [ ] **Step 1: Seed defaults if `categories` is empty.**

  After the `ALTER` block, add a `seedCategoriesIfEmpty()` helper:

  ```ts
  const DEFAULT_CATEGORIES = [
    { name: 'Food',          icon: '🍴', color: '#f97316', isSystem: 0 },
    { name: 'Groceries',     icon: '🛒', color: '#3b82f6', isSystem: 0 },
    { name: 'Transport',     icon: '🚌', color: '#f59e0b', isSystem: 0 },
    { name: 'Shopping',      icon: '🛍️', color: '#ec4899', isSystem: 0 },
    { name: 'Bills',         icon: '📄', color: '#64748b', isSystem: 0 },
    { name: 'Entertainment', icon: '🎮', color: '#a855f7', isSystem: 0 },
    { name: 'Health',        icon: '💊', color: '#10b981', isSystem: 0 },
    { name: 'Other',         icon: '📦', color: '#6b7280', isSystem: 1 },
  ];
  ```

  Run `INSERT OR IGNORE` for each default (uniqueness on `name COLLATE NOCASE` makes this idempotent), assigning `sort_order` by array index. Every color above must exist in `CATEGORY_PALETTE` (see Task 9).

- [ ] **Step 2: Back-fill `category_id` for every row whose `category_id IS NULL`.**

  For each of the four tables, run a single statement:

  ```sql
  UPDATE expenses
     SET category_id = (
       SELECT id FROM categories
        WHERE LOWER(name) = LOWER(expenses.category)
        LIMIT 1
     )
   WHERE category_id IS NULL;
  ```

  Repeat for `recurring_expenses`, `category_budgets`, `expense_tags`.

- [ ] **Step 3: Auto-create unknown categories.**

  Any row still with `category_id IS NULL` after Step 2 has a string that didn't match a default. Insert one new category per distinct unknown string (sort_order = max+1, default icon `📦`, default color `#6b7280`), then re-run the back-fill.

  ```sql
  INSERT OR IGNORE INTO categories (name, icon, color, sort_order)
    SELECT DISTINCT category, '📦', '#6b7280',
           (SELECT COALESCE(MAX(sort_order), 0) FROM categories) + 1
      FROM expenses
     WHERE category_id IS NULL;
  ```

  Then repeat the `UPDATE … SET category_id = …` from Step 2.

  > Idempotent: on subsequent boots, every row already has `category_id`, so the WHERE clauses match nothing and the migration is a no-op.

## Task 3: Backend types + read API

**Files:**
- `server/src/types.ts` — add `CategoryRow`.
- New file: `server/src/routes/categories.ts` — `GET /categories` returns `[{ id, name, icon, color, sortOrder, isArchived }]` ordered by `sort_order`. Default excludes archived; `?includeArchived=1` includes them.
- `server/src/index.ts` — register the new router.

- [ ] Define `CategoryRow` interface mirroring the table.
- [ ] Implement `GET /categories` (read-only for Phase 1 — CRUD lands in Phase 3).
- [ ] Update `ExpenseRow` to add optional `categoryId: number | null`. Update the SELECT in `routes/expenses.ts` to include it. Same for `recurring_expenses`, `category_budgets`, `expense_tags` rows.

## Task 4: Frontend — `useCategories` hook + replace all hard-coded lists

**Files:**
- New: `client/src/hooks/useCategories.ts` — TanStack Query hook hitting `GET /api/categories`.
- New: `client/src/types/category.ts` — `Category` interface.
- Modify: `client/src/views/expense-quick-add/expense-quick-add.tsx:13-22` — delete `CATEGORIES`, replace with `const { data: categories } = useCategories()`.
- Modify: `client/src/views/expenses-view/expenses-view.tsx:22-42` — delete `CATEGORY_ICONS` and `CATEGORY_MODIFIER`. Build a `categoriesById` lookup from the hook. Replace `CATEGORY_ICONS[name]` with `categoriesById[id]?.icon`. Replace BEM modifier (e.g., `expenses-view__expense-card--food`) with `style={{ borderColor: cat.color }}` (or a `--cat-color` CSS variable on the card root).
- Modify: `client/src/components/tag-manage-modal/tag-manage-modal.tsx:6-15` — same replacement.
- Modify: `client/src/types/index.ts:259-269` — delete `EXPENSE_CATEGORIES` and the `ExpenseCategory` literal type. Replace usages with `number` (the category_id) wherever a category was previously typed.

- [ ] Implement `useCategories` with the same caching shape as `useTags`.
- [ ] Audit `grep -r EXPENSE_CATEGORIES client/src` — replace every consumer.
- [ ] Update `Expense` type in `client/src/types/index.ts` to add `categoryId: number`. Update the components that render `expense.category` to render `categoriesById[expense.categoryId]?.name` instead.
- [ ] Verify the app still runs end-to-end with no UI regressions.

---

# Phase 2 — Filter API + clickable category cards (drill-down to timeline)

## Task 5: Backend — `?categoryId=` filter on `GET /expenses`

**File:** `server/src/routes/expenses.ts` (the list handler).

- [ ] Add an optional `categoryId` query param. When present (parseable as int), append `AND category_id = ?` to the existing query. Existing `start` / `end` filters compose normally.
- [ ] Validate: invalid `categoryId` (non-integer, negative) returns 400 via `sendError`.

## Task 6: Frontend — make category cards clickable; introduce `?category=:id` on `/expenses`

**Files:**
- `client/src/views/expenses-view/expenses-view.tsx:372-491` — wrap each card in a button (or add `onClick` to the existing `<div>` and `role="button"` + `tabIndex={0}` for a11y).
- The same view already owns the `viewMode` state ('timeline' | 'category'). Reuse it; don't introduce a new route.

- [ ] On card click: set `viewMode = 'timeline'` and push a query param `?category={id}` via `useSearchParams`. The timeline filter reads from this param.
- [ ] In the timeline render block (lines 317-370), when `?category={id}` is present, filter `expensesByDateRange` to that id **and** show a removable "filter chip" at the top: `[🍴 Food ✕]`. Clicking the ✕ clears the param.
- [ ] On filtered timeline, hide the view-mode toggle's "By Category" tab affordance (or keep it — it switches back when tapped, which clears the filter).
- [ ] **Decision:** filter client-side using the already-fetched month range, *or* server-side via the new `?categoryId=` param. **Recommendation:** server-side — it's free now that the API supports it, and it lets us extend the visible date range without re-thinking pagination later. The two existing fetches (`useExpensesByDateRange`) become parameterized.

## Task 7: Frontend — `useExpensesByDateRange` accepts a `categoryId`

**File:** `client/src/hooks/useExpenses.ts` (or wherever `useExpensesByDateRange` lives).

- [ ] Accept an optional `categoryId` param; include it in the query key and the request URL.

---

# Phase 3 — Management UI (CRUD)

## Task 8: Backend — `POST`, `PUT`, `DELETE` `/categories`

**File:** `server/src/routes/categories.ts`.

- [ ] `POST /categories` — `{ name, icon, color }`. Auto-assign `sort_order = max+1`. Returns the new row.
- [ ] `PUT /categories/:id` — partial update of `name`, `icon`, `color`, `sort_order`, `is_archived`. Renames are global (live-link contract).
- [ ] `DELETE /categories/:id` — **soft-delete only**: sets `is_archived = 1`. Reject hard-delete.
- [ ] **Protect the "Other" category.** Mark it with a `is_system INTEGER NOT NULL DEFAULT 0` column (added to the schema in Task 1; seeded as `1` only for "Other"). Reject rename, recolor-allowed, archive on any row where `is_system = 1` with a clear 400 error.
- [ ] **Archive endpoint also returns a usage report** so the UI can warn before confirming. Shape: `{ id, name, isArchived, dependents: { activeRecurring: number, activeBudgets: number, expensesLast30Days: number } }`. Computed via three `COUNT(*)` queries against `recurring_expenses` (where `is_active = 1`), `category_budgets` (where `month >= current month`), and `expenses` (where `created_at >= now() - 30 days`).

## Task 9: Frontend — `<CategoryManageModal>` + entry points

**Files:**
- New: `client/src/components/category-manage-modal/category-manage-modal.tsx` — modeled on `tag-manage-modal.tsx`.
- New: `client/src/hooks/useCategoriesCrud.ts` — `useCreateCategory`, `useUpdateCategory`, `useArchiveCategory` using `useOptimisticMutation`.
- Modify: the By Category view header — add a small ⚙ icon that opens the modal.
- Modify: the Add Expense screen — long-press on a category icon could open the manage modal too (optional, defer if scope tight).

- [ ] Modal lists all non-archived categories with drag-to-reorder (use simple "move up/down" arrows for v1 — drag is a follow-up).
- [ ] Each row: icon picker (plain text input that accepts any emoji — same pattern as `tag-manage-modal.tsx`), color picker (**curated palette swatch grid** — see below), name, archive button. The "Other" row shows the icon/color/name as read-only with a small "system" badge — only `sort_order` is editable for it.
- [ ] **Curated color palette** — a single shared constant in `client/src/constants/categoryPalette.ts`, exported and used by both `<CategoryManageModal>` and the migration's "auto-create" fallback (so unknown-string back-fills pick from the palette in round-robin order, never an off-palette color). Render as a 4×4 swatch grid:

  ```ts
  export const CATEGORY_PALETTE = [
    '#f97316', // orange  (default: Food)
    '#f59e0b', // amber   (default: Transport)
    '#eab308', // yellow
    '#84cc16', // lime
    '#10b981', // emerald (default: Health)
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#3b82f6', // blue    (default: Groceries)
    '#6366f1', // indigo
    '#a855f7', // purple  (default: Entertainment)
    '#ec4899', // pink    (default: Shopping)
    '#ef4444', // red
    '#64748b', // slate   (default: Bills)
    '#6b7280', // gray    (default: Other)
    '#78716c', // stone
    '#0ea5e9', // sky
  ] as const;
  ```

  All Tailwind-500 shades, balanced for use as a 1-color category badge on a light background. No native `<input type="color">` — selection is constrained to this palette so categories stay visually consistent.

- [ ] **Archive confirmation flow.** When the user clicks "Archive" on a category, fetch `GET /categories/:id` to get the `dependents` payload. If any of `activeRecurring`, `activeBudgets`, `expensesLast30Days` are non-zero, show a confirm dialog: *"3 active recurring expenses still use Bills. They'll keep recording but the category won't appear in pickers."* User can confirm or cancel. Don't auto-disable downstream — recurring/budgets continue silently.

- [ ] "Add new" form at the bottom — name + emoji text input + palette picker.
- [ ] Show archived categories in a collapsible "Archived" section with an "Unarchive" button.

## Task 10: Replace BEM category modifiers with data-driven styling

**File:** `client/src/views/expenses-view/expenses-view.less` (and the .tsx).

- [ ] Find every `.expenses-view__expense-card--{name}` rule. Replace with a single base rule that reads from a CSS variable: `border-left-color: var(--cat-color, #6b7280);`.
- [ ] In the .tsx, set `style={{ '--cat-color': category.color } as CSSProperties}` on the card root.
- [ ] Same for the By Category cards if they have similar modifiers.

---

# Phase 4 — Cleanup: drop legacy `category` columns

After Phase 3 has shipped and run in production for at least one week with no rollbacks, schedule the cleanup.

## Task 11: Drop `category TEXT` columns

**File:** `server/src/db/index.ts`.

- [ ] In a new try/catch migration block: `ALTER TABLE expenses DROP COLUMN category;` (and the other three tables). SQLite supports `DROP COLUMN` since 3.35 — verify the deployed version.
- [ ] Remove all references to `row.category` in the backend; consumers should use `row.categoryId` and join client-side via the hook.
- [ ] **Rollback plan:** keep the columns nullable but unused for one full week before dropping. If any breakage shows up, revert the SELECT change without losing data.

## Task 12: Frontend cleanup

- [ ] `grep -r "CATEGORY_ICONS\|CATEGORY_MODIFIER\|EXPENSE_CATEGORIES" client/src` → expect zero hits.
- [ ] Delete `client/src/types/index.ts:259-269` (the `EXPENSE_CATEGORIES` constant).
- [ ] Verify the app still runs end-to-end.

---

## Resolved decisions (2026-05-08)

1. **"Other" is a system category, undeletable and unrenamable.** Schema gets an `is_system INTEGER NOT NULL DEFAULT 0` column; only "Other" is seeded with `is_system = 1`. The archive endpoint rejects archive/rename on system rows. (See Task 1 + Task 8.)
2. **Curated palette only.** A single shared `CATEGORY_PALETTE` constant (16 Tailwind-500 colors) drives the modal swatch grid and the migration's auto-create fallback. No native color picker. (See Task 9.)
3. **Emoji text input for icons.** Same pattern as `tag-manage-modal.tsx` — plain text field, no picker dependency.
4. **Archive warns about live dependents.** `GET /categories/:id` returns a `dependents` count payload (active recurring, active budgets, expenses last 30 days); the confirm dialog quotes the numbers. Recurring/budgets are not auto-disabled — they keep recording silently against the archived category. (See Task 8 + Task 9.)

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration mis-maps existing data (case mismatches, typos) | Medium | Step 3 of the migration auto-creates a category for any unmatched string — no data is lost. User can rename/merge in the UI later. |
| BEM CSS removal breaks visual styling | Low | The CSS variable swap is mechanical. Visually verify each category renders with the right color before merging Phase 3. |
| Frontend hook fetch race delays first paint | Low | `useCategories` hits a tiny endpoint; cache it indefinitely (no `staleTime`) and prefetch on app boot alongside `useTags`. |
| `EXPENSE_CATEGORIES` type drift means a current consumer is silently broken | Low | Phase 1 Task 4 grep audit will surface it. |
