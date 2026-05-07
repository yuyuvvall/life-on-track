# Design: Expense Tags

**Date:** 2026-05-07
**Scope:** Architecture and contract for the expense-tags feature. Implementation steps live in [PLAN.md](./PLAN.md) (written next).

See [RESEARCH.md](./RESEARCH.md) for the code audit and constraints this design rests on.

---

## Summary

A "tag" is a reusable expense template (`name`, `category`, `amount`, optional `note`, `icon`, `color`). It does two things:

1. **One-tap entry.** A horizontal chip row on `/expenses` lets the user log a frequent expense in a single tap. The expense is created with today's date and the tag's snapshot defaults; an undo toast covers misclicks.
2. **Pre-fill in manual entry.** The same chip row appears in `/expense/add`. Tapping a chip populates the keypad with the tag's defaults, leaving the user free to override any field before submit.

Tags are also assignable to recurring-expense templates and propagate to every generated expense, so a future "filter by tag" view sees a consistent join key across one-off and recurring spend.

Tag CRUD lives in a single `<TagManageModal>` reachable from the chip row ("⚙️ Manage tags") and from a "💾 Save as tag" button in `/expense/add`.

---

## Design Principles

1. **One-tap is sacred.** A tag-chip tap on `/expenses` MUST be a single tap that results in a saved expense plus an undo toast. No confirm sheets, no date pickers, no extra modals.
2. **Snapshot, not live link.** When an expense is created from a tag, the expense row stores its own `category`, `amount`, `note` (current pattern). Editing or deleting the tag never mutates historical expenses. The `tag_id` is the only live link, and only for filter purposes.
3. **Soft-delete tags.** Deletion sets `is_archived = 1`. Past expenses keep their `tag_id` and remain filterable. This protects historical analysis from impulsive cleanup.
4. **Optional everywhere.** `tag_id` is nullable on `expenses` and `recurring_expenses`. Existing flows that don't know about tags keep working unchanged.
5. **No new patterns.** Reuse `useOptimisticMutation`, `showToast`, the existing `request<T>()` API client, the `trackedExecute` query logger, the dynamic-PUT pattern, and BEM CSS conventions. No new infrastructure.
6. **Defer the filter UI.** The data model supports filtering today; the UI ships in a follow-up plan. This plan stops at "the column exists and is reliably populated."

---

## Data Model

### `expense_tags` (new table)

```sql
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

CREATE INDEX IF NOT EXISTS idx_expense_tags_archived ON expense_tags(is_archived);
```

Notes on each column:
- `name` is **not unique** (see RESEARCH open question 3).
- `category` is a free-form string, validated client-side against the canonical 8 (`Food, Groceries, Transport, Shopping, Bills, Entertainment, Health, Other`).
- `amount` is required (see brainstorming decision: "amount required"). The `CHECK (amount >= 0)` mirrors the constraint on `category_budgets`.
- `icon` defaults to the category's emoji on the client; persisted as plain text so the user can override with any emoji.
- `color` defaults to the category's hex; stored as `#RRGGBB` text.
- `is_archived` is `INTEGER` (SQLite convention — same shape as `is_active` on `recurring_expenses`).
- `last_used_at` updated server-side on every `POST /expenses` / `POST /recurring-expenses/generate` that uses this tag. Drives the chip-row sort order.

### `expenses` and `recurring_expenses` (extended)

Add a single nullable column to each, via the project's append-an-`ALTER`-in-the-init-block pattern (see [db/index.ts:179-185](../../server/src/db/index.ts#L179-L185) precedent):

```sql
-- Inside initDb() try/catch migration block:
ALTER TABLE expenses ADD COLUMN tag_id INTEGER;
ALTER TABLE recurring_expenses ADD COLUMN tag_id INTEGER;
```

No FK constraint (project convention — there are zero FKs in the current schema). The server validates `tag_id` exists on write; on read, a missing tag is rendered as `tagId: null` and the chip filter (future) shows the row under "untagged." Soft-delete keeps the tag row alive so this stays consistent.

### Why no junction table

The brainstorming decision was "exactly one tag per expense." A nullable scalar column is strictly simpler than a junction:
- No second JOIN in the timeline query.
- No surprise duplicate rows when summing by tag.
- Migration to multi-tag later is straightforward (drop column, add junction, copy data) — `tag_id` is forward-compatible.

---

## API Contract

All routes are mounted under `/api`. Errors use the existing inline pattern: `res.status(N).json({ message: '...' })`.

### `GET /api/tags`

Query params:
- `includeArchived` (optional, `'1'` or omitted) — when set, includes archived tags.

Response: `200 OK` → `Tag[]` ordered by `last_used_at DESC NULLS LAST, created_at DESC`.

### `GET /api/tags/:id`

Response: `200 OK` → `Tag`, or `404` with `{ message: 'Tag not found' }`.

### `POST /api/tags`

Body:
```ts
{
  name: string,           // required, non-empty
  category: string,       // required, validated client-side
  amount: number,         // required, >= 0
  note?: string,
  icon: string,           // required (defaulted client-side from category)
  color: string,          // required (defaulted client-side from category)
}
```

Validations: `name` non-empty, `amount` finite and ≥ 0, `category`/`icon`/`color` non-empty strings. Returns `201` + the created `Tag`.

### `PUT /api/tags/:id`

Body: any subset of the create body, plus optional `isArchived: boolean` (the soft-delete toggle that the manage modal also exposes as "Restore"). Dynamic SQL build, mirroring [expenses.ts:190-241](../../server/src/routes/expenses.ts#L190-L241).

Returns `200` + updated `Tag`, or `404`.

### `DELETE /api/tags/:id`

**Semantics: soft delete.** Sets `is_archived = 1`. Returns `204`.

If we ever need a hard delete, that's a separate `?force=1` flag. Not in this plan.

### `POST /api/expenses` and `PUT /api/expenses/:id`

Extended to accept optional `tagId: number | null` in the body.

On the server:
1. If `tagId` is provided, look up the tag. If it doesn't exist or is archived, return `400 { message: 'Invalid or archived tagId' }`.
2. Persist `tag_id` on the row.
3. After successful insert/update, fire-and-forget `UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?` (own `trackedExecute` call with purpose `'updateTagLastUsedAt'`). Failures here MUST NOT fail the request.

The expense row STILL stores its own `category`, `amount`, `note` — the tag is a snapshot source, not the source of truth. The client sends the resolved values. The server does not auto-fill from the tag if some fields are missing — that resolution happens on the client where it can be debounced and shown to the user.

### `POST /api/recurring-expenses` and `PUT /api/recurring-expenses/:id`

Same `tagId` extension as expenses. Same validation.

### `POST /api/recurring-expenses/generate`

Modified to copy `tag_id` from the template into each generated expense ([recurringExpenses.ts:299-302](../../server/src/routes/recurringExpenses.ts#L299-L302)). Same `last_used_at` bump as direct `POST /expenses`.

### Swagger

Three new schemas (`Tag`, `CreateTagRequest`, `UpdateTagRequest`); existing `Expense`, `RecurringExpense`, and the request DTOs gain `tagId`.

---

## Frontend Architecture

### Types — `client/src/types/index.ts`

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

Existing `Expense`, `CreateExpenseRequest`, `UpdateExpenseRequest`, `RecurringExpense`, `CreateRecurringExpenseRequest`, `UpdateRecurringExpenseRequest` each gain an optional `tagId?: number | null`.

### API client — `client/src/api/client.ts`

Add a `tagsApi` mirroring the shape of `expensesApi`:

```ts
export const tagsApi = {
  getAll: (includeArchived?: boolean, purpose?: string) =>
    request<Tag[]>(`/tags${includeArchived ? '?includeArchived=1' : ''}`, { purpose }),
  getById: (id: number, purpose?: string) =>
    request<Tag>(`/tags/${id}`, { purpose }),
  create: (data: CreateTagRequest, purpose?: string) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify(data), purpose }),
  update: (id: number, data: UpdateTagRequest, purpose?: string) =>
    request<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data), purpose }),
  delete: (id: number, purpose?: string) =>
    request<void>(`/tags/${id}`, { method: 'DELETE', purpose }),
};
```

### Hooks — `client/src/hooks/useTags.ts` (new)

Mirror `useExpenses.ts`:
- `useTags(includeArchived?: boolean)` → `useQuery({ queryKey: ['tags', { includeArchived }], ... })`
- `useCreateTag()` / `useUpdateTag()` / `useDeleteTag()` — invalidate `['tags']` on success.

The "soft delete" affordance is `useDeleteTag` calling `DELETE /tags/:id` (which the server interprets as archive). To restore an archived tag, the manage modal calls `useUpdateTag({ isArchived: false })`.

### Components

#### `<TagChipRow mode="quick-add" | "prefill" />`

`client/src/components/tag-chip-row/tag-chip-row.tsx` (+ `.less`, `.test.tsx`, `index.ts`).

Props:
```ts
type TagChipRowProps =
  | { mode: 'quick-add' }
  | { mode: 'prefill'; selectedTagId?: number; onSelect: (tag: Tag) => void };
```

Behavior:
- Fetches `useTags(false)`. While loading, renders a skeleton row of 3 placeholder chips.
- Renders a horizontally-scrollable row (no snapping; `overflow-x: auto`, hidden scrollbar like `expense-quick-add` category scroll). Each chip shows `icon`, `name`, and `₪ amount` in a vertical mini-stack.
- A trailing "⚙️ Manage" chip opens `<TagManageModal>`.
- An empty state (no non-archived tags) renders a single "+ Create your first tag" chip that opens the modal in create mode.

`mode="quick-add"` (used on `/expenses`):
- Tap chip → calls `useCreateExpense().mutate({ amount, category, note, tagId, createdAt: new Date().toISOString() })` with optimistic insert.
- On success → `showToast({ message: \`Logged ₪${amount} ${name}\`, durationMs: 5000, action: { label: 'Undo', onClick: () => deleteExpense.mutate(newId) } })`.
- On failure → existing `useOptimisticMutation` rollback path takes over and shows error toast.
- When the parent `/expenses` is on a non-current month, render a small caption above the row: `(taps add to today)`.

`mode="prefill"` (used on `/expense/add`):
- Tap chip → calls `onSelect(tag)`. The parent uses this to set local state (`amount`, `category`, `note`, `tagId`).
- Selected chip is visually highlighted (border + brighter color).
- Re-tapping the selected chip clears the selection (and the parent resets `tagId` to `null`; user-entered `amount`/`category`/`note` are preserved).

#### `<TagManageModal>`

`client/src/components/tag-manage-modal/tag-manage-modal.tsx` (+ `.less`, `.test.tsx`, `index.ts`).

Props:
```ts
type TagManageModalProps = {
  initialMode?: 'list' | 'create' | 'edit';
  initialDraft?: Partial<CreateTagRequest>;  // for "Save as tag" pre-fill
  onClose: () => void;
};
```

Layout (matches `recurring-options-modal.tsx` style — fixed full-screen backdrop, centered card, header / body / actions):
- **List view (default).** Vertical list of non-archived tags with edit + archive icons. Plus a "Show archived" toggle that re-fetches with `includeArchived=true` and renders archived tags with a "Restore" action. Plus a "+ New tag" button.
- **Create / edit form.** Fields:
  - Name (text input)
  - Category (8-button row, identical to `expense-quick-add` selector)
  - Amount (small numeric input — re-using the keypad would be over-engineering for a settings flow; raw `<input type="number" step="0.01">` is fine here)
  - Note (text input, optional)
  - Icon (single-line emoji input — defaults to category's emoji; user can paste any emoji)
  - Color (hex input + the 8 category swatches as quick picks; defaults to category's color)
  - Save / Cancel
- On save → `useCreateTag` or `useUpdateTag`. Success → return to list view (or close, if opened from "Save as tag").

#### Modifications to existing views

`client/src/views/expenses-view/expenses-view.tsx`:
- After the controls row at [expenses-view.tsx:247-270](../../client/src/views/expenses-view/expenses-view.tsx#L247-L270), render `<TagChipRow mode="quick-add" />`. Pass `isCurrentMonth` so the chip row knows whether to show the "(taps add to today)" caption.

`client/src/views/expense-quick-add/expense-quick-add.tsx`:
- Add `tagId` to local state (initialized from the loaded expense in edit mode).
- After the category scroll at [expense-quick-add.tsx:168-196](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L168-L196), render `<TagChipRow mode="prefill" selectedTagId={tagId} onSelect={handleTagSelect} />`. `handleTagSelect` sets `amount = String(tag.amount)`, `category = tag.category`, `note = tag.note ?? ''`, `tagId = tag.id`.
- Submit handler at [expense-quick-add.tsx:86-109](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L86-L109) includes `tagId` in all three mutation payloads when set.
- Add a "💾 Save as tag" button. Placement: a small text button below the notes input, hidden in edit mode. Opens `<TagManageModal initialMode="create" initialDraft={{ name: note || category, category, amount: parseFloat(amount), note, icon, color }} />` (icon/color resolved from current category).

### Routing

No new routes. The manage modal is a React-controlled overlay rendered from inside `<TagChipRow>` (and from `expense-quick-add`'s "Save as tag"). The existing tab-bar-hidden routes ([App.tsx:14](../../client/src/App.tsx#L14)) are unchanged.

### Styling

- Use BEM via Less, matching the project convention. Class root: `.tag-chip-row` and `.tag-manage-modal`.
- Each chip uses `background: tag.color` at low alpha for the body and full alpha for the icon ring; matches the visual idiom of the existing category buttons in `expense-quick-add.less`.
- Use existing tokens (`@space-*`, `@radius-*`, `@surface-*`) — no new variables.

### Tests

Frontend unit tests via Vitest + RTL:
- `tag-chip-row.test.tsx`:
  - renders empty state when no tags;
  - renders chips for non-archived tags;
  - `mode="quick-add"` calls `useCreateExpense` with the tag's snapshot values + today's `createdAt`;
  - `mode="prefill"` calls `onSelect` with the full tag.
- `tag-manage-modal.test.tsx`:
  - create flow validates required fields;
  - edit flow loads existing tag values;
  - archive button calls `useDeleteTag`;
  - `initialDraft` pre-populates the form.

No backend tests in this plan (the project has none today; adding a backend test harness is its own effort). Manual API verification through Swagger UI before each phase merges.

---

## Data Flow

### One-tap on `/expenses`

```
User taps chip (tag id=42)
  ↓
<TagChipRow> calls useCreateExpense.mutate({
    amount: tag.amount,
    category: tag.category,
    note: tag.note,
    tagId: 42,
    createdAt: new Date().toISOString(),
})
  ↓
useOptimisticMutation inserts a synthetic Expense row into ['expenses', 'range', start, end] cache
  ↓
POST /api/expenses (server)
  ↓
INSERT INTO expenses (..., tag_id) VALUES (..., 42)
  ↓
UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = 42  (best-effort)
  ↓
Server returns the inserted Expense
  ↓
Client reconciles cache
  ↓
showToast({ ..., action: { label: 'Undo', onClick: () => deleteExpense.mutate(newId) }})
```

### Pre-fill in `/expense/add`

```
User taps chip (tag id=42)
  ↓
<TagChipRow mode="prefill"> calls onSelect(tag)
  ↓
expense-quick-add handleTagSelect():
    setAmount(String(tag.amount))
    setCategory(tag.category)
    setNote(tag.note ?? '')
    setTagId(42)
  ↓
[user adjusts amount / category / note as desired]
  ↓
User taps green submit
  ↓
useCreateExpense.mutate({ amount, category, note, tagId: 42, createdAt: selectedDate.toISOString() })
  ↓
[same backend path as above]
```

### Recurring template generation

```
[mount of /expenses fires useGenerateRecurringExpenses]
  ↓
POST /api/recurring-expenses/generate
  ↓
For each active template with matching recurrence_day:
    INSERT INTO expenses (amount, category, note, tag_id, created_at)
    VALUES (template.amount, template.category, template.note, template.tag_id, NOW())
    UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = template.tag_id  (best-effort, when tag_id is not null)
    UPDATE recurring_expenses SET last_generated_date = today WHERE id = template.id
```

---

## Error Handling

- **Validation errors (400)** on POST/PUT tag endpoints: `{ message: 'name is required' }` etc. Client surfaces as a form-level error in the manage modal.
- **Invalid tagId** on expense write (tag doesn't exist or is archived): server returns `400 { message: 'Invalid or archived tagId' }`. Client treats as a generic mutation failure (rollback + error toast). This is rare — only happens if a tag was archived between `useTags` cache populating and the user tapping a chip.
- **last_used_at update failure**: logged via `trackedExecute`'s normal error path; never fails the user-facing request.
- **Network errors during one-tap**: the existing optimistic-mutation rollback path handles it (`errorMessage: 'Could not log expense'`).
- **Archived-tag race**: if a chip is tapped right as the tag is being archived in another tab, the server rejects with 400 and the client toast-rolls back. The chip will disappear on the next `useTags` refetch (which `useDeleteTag` triggers via invalidation).

---

## Sequencing Hint

Three phases, expected to ship as three PRs (the project precedent — one phase per PR, see [expenses-history-and-budgets-2026-04-17/PLAN.md](../expenses-history-and-budgets-2026-04-17/PLAN.md)):

1. **Phase 1 — Schema + tags CRUD API + types.** Pure backend + shared types. No UI. Manually verify via Swagger.
2. **Phase 2 — Tag chip row + one-tap on `/expenses`.** Wires the feature end-to-end with the simplest UI.
3. **Phase 3 — Pre-fill in `/expense/add`, recurring `tag_id` propagation, "Save as tag" affordance, manage modal polish.** Extension features and recurring symmetry.

A future, separate plan handles the **filter UI** on `/expenses`. The data is in place after Phase 1; the UI is just deferred.

---

## Out of Scope

- Bulk-tagging existing historical expenses.
- Filter UI on `/expenses` ("show only Parking expenses"). Schema is ready; UI is a follow-up.
- Multiple tags per expense.
- Tag groups / hierarchies.
- Tags applied via the `<QuickAddModal>` mini-FAB. The full `/expense/add` view gets the chip row; the mini modal stays minimal.
- Backfill of recurring templates' `tag_id` for already-generated past expenses.
- A backend test harness — adding one is a separate effort. Manual + frontend tests cover this plan.
- Tag analytics (e.g. "your top tag this month"). Belongs in a future dashboard plan.
