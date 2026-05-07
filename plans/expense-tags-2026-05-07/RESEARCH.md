# Research: Expense Tags

**Date:** 2026-05-07
**Scope:** A reusable "tag" concept that snapshots common expense defaults (category, amount, note, icon, color) so frequent purchases (e.g. parking outside work) become a one-tap entry, are linkable to the expense for future filtering, and can also pre-fill the keypad in the manual quick-add flow. Tags also apply to recurring-expense templates.

See [DESIGN.md](./DESIGN.md) for the architecture decisions and [PLAN.md](./PLAN.md) (written next) for the phased implementation steps.

---

## Current Expenses Stack (as of 2026-05-07)

### Frontend entry points

#### Quick-add (one-off + recurring) — [expense-quick-add.tsx](../../client/src/views/expense-quick-add/expense-quick-add.tsx)

- 8 hard-coded categories with emoji + color at [expense-quick-add.tsx:11-20](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L11-L20):
  ```ts
  const CATEGORIES = [
    { id: 'Food', icon: '🍴', color: '#f97316' },
    { id: 'Groceries', icon: '🛒', color: '#3b82f6' },
    { id: 'Transport', icon: '🚌', color: '#f59e0b' },
    { id: 'Shopping', icon: '🛍️', color: '#ec4899' },
    { id: 'Bills', icon: '📄', color: '#64748b' },
    { id: 'Entertainment', icon: '🎮', color: '#a855f7' },
    { id: 'Health', icon: '💊', color: '#10b981' },
    { id: 'Other', icon: '📦', color: '#6b7280' },
  ] as const
  ```
- Local state shape ([expense-quick-add.tsx:45-58](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L45-L58)): `amount` (string for keypad math), `category`, `note`, `selectedDate`, `isRecurring`, `recurrenceType`, `recurrenceDay`, two modal toggles.
- Uses `useCreateExpense`, `useUpdateExpense`, `useCreateRecurringExpense`, `useExpense` (for edit mode).
- Submit handler at [expense-quick-add.tsx:86-109](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L86-L109) dispatches one of three mutations based on `isRecurring` and `isEditMode`. Payload shapes are stable: `{ amount, category, note?, createdAt }` for one-off and `{ amount, category, note?, recurrenceType, recurrenceDay }` for recurring.
- Numeric keypad is a 5-column grid of `<KeypadButton>`s ([expense-quick-add.tsx:263-307](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L263-L307)). Operators (÷×−+) and ₪ are intentionally disabled today.

#### Expenses list — [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx)

- Top of view shows month-nav header + view-mode toggle (Timeline / By Category) + `+ Add` button at [expenses-view.tsx:226-270](../../client/src/views/expenses-view/expenses-view.tsx#L226-L270). This is the natural anchor for a chip row.
- Timeline cards already use category icons and BEM modifiers ([expenses-view.tsx:20-40](../../client/src/views/expenses-view/expenses-view.tsx#L20-L40), [expenses-view.tsx:285-320](../../client/src/views/expenses-view/expenses-view.tsx#L285-L320)).
- Existing toast-with-undo pattern on delete at [expenses-view.tsx:189-208](../../client/src/views/expenses-view/expenses-view.tsx#L189-L208) — can be mirrored for one-tap tag add.
- `useGenerateRecurringExpenses()` fires on mount ([expenses-view.tsx:64](../../client/src/views/expenses-view/expenses-view.tsx#L64)) — unrelated to tags but worth noting (one-tap tag add must not re-fire it).

#### Quick-add FAB — [quick-add-fab.tsx](../../client/src/components/quick-add-fab/quick-add-fab.tsx)

- Long-press (≥500 ms) navigates to `/expense/add` ([quick-add-fab.tsx:39-47](../../client/src/components/quick-add-fab/quick-add-fab.tsx#L39-L47)). Short tap opens the smaller `<QuickAddModal>` for tasks/expenses. Tag chips in the FAB are out of scope for this plan — surface gets crowded.

### Data-fetch hooks — [useExpenses.ts](../../client/src/hooks/useExpenses.ts)

- React Query keys: `['expenses']`, `['expenses', id]`, `['expenses', 'range', start, end]`, `['recurringExpenses']`.
- `useCreateExpense` / `useUpdateExpense` invalidate `['expenses']` and `['weeklySummary']` ([useExpenses.ts:37-60](../../client/src/hooks/useExpenses.ts#L37-L60)).
- `useDeleteExpense` already uses [useOptimisticMutation.ts](../../client/src/hooks/useOptimisticMutation.ts) — same primitive will work for one-tap tag add (insert optimistic row, replace on server response, rollback + toast on error).

### API client — [client.ts](../../client/src/api/client.ts)

- Base URL from `VITE_API_URL` or `/api` ([client.ts:27-28](../../client/src/api/client.ts#L27-L28)).
- Generic `request<T>()` with cold-start retry, optional `X-Purpose` header ([client.ts:38-95](../../client/src/api/client.ts#L38-L95)).
- `expensesApi` and `recurringExpensesApi` ([client.ts:170-226](../../client/src/api/client.ts#L170-L226)) follow a uniform `getAll / getById / getByDateRange? / create / update / delete` shape — `tagsApi` should match.
- No auth header is sent — single-user app.

### Types — [types/index.ts](../../client/src/types/index.ts)

- `Expense` ([types/index.ts:30-36](../../client/src/types/index.ts#L30-L36)) and `RecurringExpense` ([types/index.ts:42-50](../../client/src/types/index.ts#L42-L50)) are camelCase API-shape types.
- `EXPENSE_CATEGORIES` constant at [types/index.ts:221-231](../../client/src/types/index.ts#L221-L231) is the third copy of the category list and is **missing `Groceries`** (pre-existing drift; not this plan's problem but flag if it bites).

### Server route — [expenses.ts](../../server/src/routes/expenses.ts)

- POST handler at [expenses.ts:121-151](../../server/src/routes/expenses.ts#L121-L151) validates `amount` and `category` as required, then `INSERT INTO expenses (...)` and re-`SELECT` by `lastInsertRowid`. Adding a nullable `tag_id` column means extending the dynamic insert.
- PUT handler at [expenses.ts:190-241](../../server/src/routes/expenses.ts#L190-L241) builds dynamic SQL from a whitelist of fields — same pattern extends cleanly to `tagId`.
- All queries go through `trackedExecute(sql, technicalPurpose)` ([db/queryLogger.ts:115-161](../../server/src/db/queryLogger.ts#L115-L161)).

### Server route — [recurringExpenses.ts](../../server/src/routes/recurringExpenses.ts)

- Same PUT/POST shape as `expenses.ts`. The generation endpoint at [recurringExpenses.ts:267-327](../../server/src/routes/recurringExpenses.ts#L267-L327) `INSERT`s into `expenses` from each active template — **must propagate the template's `tag_id` to the generated expense.**

### Schema — embedded in [server/src/db/index.ts](../../server/src/db/index.ts)

- Schema lives as a multi-line string at [db/index.ts:17-145](../../server/src/db/index.ts#L17-L145) and is split + executed on boot in `initDb()` at [db/index.ts:148-186](../../server/src/db/index.ts#L148-L186). **No standalone `schema.sql` file exists** (the older plan referenced one; that's stale). All `CREATE TABLE` statements use `IF NOT EXISTS` and migrations are appended as ad-hoc `ALTER`s wrapped in try/catch (see [db/index.ts:179-185](../../server/src/db/index.ts#L179-L185) for the `scheduled_complete_date` precedent).
- Current `expenses` table at [db/index.ts:85-91](../../server/src/db/index.ts#L85-L91):
  ```sql
  CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Current `recurring_expenses` at [db/index.ts:94-104](../../server/src/db/index.ts#L94-L104) — same shape plus `recurrence_type`, `recurrence_day`, `is_active`, `last_generated_date`.
- No FK constraints anywhere in the project. Categories are free-form `TEXT`. IDs are `INTEGER PRIMARY KEY AUTOINCREMENT`.

### Swagger — [swagger.ts](../../server/src/swagger.ts)

- `Expense` schema at [swagger.ts:150-159](../../server/src/swagger.ts#L150-L159) and `CreateExpenseRequest` at [swagger.ts:161-170](../../server/src/swagger.ts#L161-L170) — must be extended with `tagId`. A new `Tag` / `CreateTagRequest` / `UpdateTagRequest` set will be added.

### Error helper

- **No `sendError` helper exists**, despite [CLAUDE.md](../../CLAUDE.md#L27)'s mention. Actual pattern is inline `res.status(N).json({ message: '...' })` (see [expenses.ts:54-56](../../server/src/routes/expenses.ts#L54-L56), [budgets.ts:34-36](../../server/src/routes/budgets.ts#L34-L36)). This plan follows the actual pattern, not the documented one.

### Tests

- Frontend: Vitest + `@testing-library/react`. Existing examples at [day-notes-content.test.tsx:1-16](../../client/src/views/closing-event/day-notes-content.test.tsx#L1-L16) and [integrity-edit-form.test.tsx:1-16](../../client/src/views/closing-event/integrity-edit-form.test.tsx#L1-L16). Run with `npm run test --workspace=client`.
- **No backend tests exist.** Plan adds frontend tests for new components but does not introduce a backend test harness — that's a separate effort. Manual API verification via Swagger UI suffices for now.

### Plan-style precedent

- This file matches the structure of [expenses-history-and-budgets-2026-04-17/RESEARCH.md](../expenses-history-and-budgets-2026-04-17/RESEARCH.md). The companion `PLAN.md` will mirror the phased style of [expenses-history-and-budgets-2026-04-17/PLAN.md](../expenses-history-and-budgets-2026-04-17/PLAN.md).

---

## Problems This Plan Solves

### Problem 1 — Repetitive entry of the same expense

The user has many expenses that recur in real life but aren't on a fixed schedule (e.g. parking outside work — happens on workdays, but not every day, and not every week the same way). Each one currently takes ≈ 8 taps in `/expense/add`: pick category, type amount, type note, submit. A one-tap chip on `/expenses` would collapse this to a single tap.

### Problem 2 — No way to group/filter expenses below the category level

Categories like "Transport" cover too many semantically distinct things (parking, bus, ride-share, gas). The user wants to ask "how much did I spend on parking this month?" — the current schema has no answer beyond a `LIKE` search on the `note` column. A `tag_id` column gives a future filter UI a stable join key.

### Problem 3 — Recurring-expense templates lack the same vocabulary

Today, recurring templates are ad-hoc rows. If "monthly gym membership" is a recurring expense, there's no way to share its identity with the future filter for "Health spending broken down by tag." Putting `tag_id` on `recurring_expenses` and propagating it on generation gives one consistent filtering surface.

---

## Constraints & Assumptions

- **SQLite via libsql / `trackedExecute`** — schema changes go in [db/index.ts](../../server/src/db/index.ts) (the embedded schema string), and ad-hoc `ALTER TABLE ... ADD COLUMN tag_id INTEGER` statements appended after the `CREATE TABLE`s for forward-compatibility on existing databases.
- **No auth / single-user.** Tags are global. No `user_id` column is added.
- **Tag is a snapshot, not a live link.** When an expense is created from a tag, the expense row stores its own `category`, `amount`, `note` copy (current pattern). Editing the tag later only affects future quick-adds, not historical rows. This satisfies the "soft link" decision.
- **Soft-delete for tags.** A new `is_archived` column on `expense_tags`. Default endpoint excludes archived; manage UI shows them with `?includeArchived=1`.
- **Single tag per expense.** No junction table. `expenses.tag_id` is nullable.
- **Recurring → expense propagation.** When `POST /api/recurring-expenses/generate` creates an expense from a template, it copies `tag_id` along with `amount`, `category`, `note`.
- **Filter UI deferred.** The `tag_id` column lands now; the actual "filter timeline by tag" UI is a follow-up plan. Schema is forward-compatible.
- **Categories remain free-form strings.** A tag carries a `category` value that must be one of the 8 existing strings, validated client-side. We accept the existing 3-place drift; this plan does not unify the lists.
- **Currency is ₪** — match [expenses-view.tsx:125](../../client/src/views/expenses-view/expenses-view.tsx#L125).
- **Tags are NOT applied to existing expenses retroactively.** No backfill, no "tag this expense" affordance on a saved row in this plan. Edit-expense gains a tag selector for symmetry, but bulk-tagging history is out of scope.

---

## Open Questions (answered inline with defaults; flag during implementation if wrong)

1. **What's the default `icon` if the user doesn't pick one?** Default: **the icon of the tag's category** (e.g. tag in Transport defaults to 🚌). Users can override via a small emoji picker in the manage modal. Avoids shipping a full icon library.
2. **What's the default `color`?** Default: **the color of the tag's category** ([expense-quick-add.tsx:11-20](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L11-L20) values). Same rationale.
3. **What if the user creates a tag with the same `name` as an existing one?** Default: **allow it.** Names are not unique. Tags are identified by `id`. The chip row shows whatever the user typed; if they want to merge, they delete one. Avoids a UNIQUE constraint and the migration headache that comes with renames.
4. **Should the chip row sort by recently-used or by creation order?** Default: **most-recently-used first** (track `last_used_at` on the tag, updated by the server when an expense is created with that `tag_id`). Most useful for the user's actual habits. Falls back to `created_at DESC` for never-used tags.
5. **What happens if the user taps a chip on a date when offline / server is down?** Default: **show error toast, no change applied.** Matches the existing optimistic-mutation rollback pattern in [useOptimisticMutation.ts](../../client/src/hooks/useOptimisticMutation.ts). No offline queueing.
6. **Can a recurring template tag be changed after the template is created?** **Yes** — PUT endpoint accepts `tagId`. Past-generated expenses keep whatever `tag_id` they were generated with (snapshot semantics).
7. **Should we expose the chip row when the user is on a *past* month in `/expenses`?** Default: **yes, but the one-tap still creates a *today*-dated expense** (per the brainstorming decision). Visual cue: a small "(adds to today)" caption above the chip row, only when viewing a non-current month, to avoid confusion.

---

## Files That Will Change

**Frontend (mostly additive):**
- [types/index.ts](../../client/src/types/index.ts) — add `Tag`, `CreateTagRequest`, `UpdateTagRequest`; add optional `tagId` to `Expense`, `CreateExpenseRequest`, `UpdateExpenseRequest`, `RecurringExpense`, `CreateRecurringExpenseRequest`, `UpdateRecurringExpenseRequest`.
- [client.ts](../../client/src/api/client.ts) — add `tagsApi`; extend existing expense create/update payloads to pass `tagId` when present.
- New: [hooks/useTags.ts](../../client/src/hooks/useTags.ts) — `useTags`, `useCreateTag`, `useUpdateTag`, `useDeleteTag` (soft-delete via `is_archived=1`), mirroring [useExpenses.ts](../../client/src/hooks/useExpenses.ts).
- New: `client/src/components/tag-chip-row/` — reusable horizontal scrolling chip row with two modes: `mode="quick-add"` (one-tap → calls `useCreateExpense` w/ optimistic insert + undo toast) and `mode="prefill"` (notifies parent via `onSelect(tag)`).
- New: `client/src/components/tag-manage-modal/` — list of tags with edit/delete/archive, emoji + color picker, category select, amount + note inputs. Opened from the chip-row's "⚙️" button and from the "Save as tag" affordance in `expense-quick-add`.
- [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx) — render `<TagChipRow mode="quick-add" />` above the timeline; add the "(adds to today)" caption when `!isCurrentMonth`.
- [expense-quick-add.tsx](../../client/src/views/expense-quick-add/expense-quick-add.tsx) — render `<TagChipRow mode="prefill" />` above the category scroll; on select, set `amount`/`category`/`note`/`tagId`. Add a "💾 Save as tag" button next to the submit button (opens `<TagManageModal>` in create mode pre-populated from the form).
- [expenses-view.less](../../client/src/views/expenses-view/expenses-view.less) and [expense-quick-add.less](../../client/src/views/expense-quick-add/expense-quick-add.less) — chip row styles, BEM-aligned.

**Backend (additive):**
- [server/src/db/index.ts](../../server/src/db/index.ts) — append `CREATE TABLE IF NOT EXISTS expense_tags (...)` + index to the schema string; append two `ALTER TABLE ... ADD COLUMN tag_id INTEGER` statements (for `expenses` and `recurring_expenses`) inside the existing try/catch migration block.
- New: [server/src/routes/tags.ts](../../server/src/routes/tags.ts) — `GET /tags?includeArchived=`, `POST /tags`, `PUT /tags/:id`, `DELETE /tags/:id` (soft-delete sets `is_archived=1`).
- [server/src/routes/expenses.ts](../../server/src/routes/expenses.ts) — accept `tagId` on POST/PUT; validate it exists and is not archived; persist on the row. Update `last_used_at` on the tag.
- [server/src/routes/recurringExpenses.ts](../../server/src/routes/recurringExpenses.ts) — accept `tagId` on POST/PUT; propagate `tag_id` to generated expenses in the `/generate` endpoint.
- [server/src/types.ts](../../server/src/types.ts) — `TagRow` + `tagRowToTag` converter; extend `ExpenseRow`/`RecurringExpenseRow` with `tag_id: number | null` and the corresponding API types with `tagId: number | null`.
- [server/src/index.ts](../../server/src/index.ts) — mount `/api/tags`.
- [server/src/swagger.ts](../../server/src/swagger.ts) — add `Tag`, `CreateTagRequest`, `UpdateTagRequest` schemas; extend `Expense`, `CreateExpenseRequest`, `UpdateExpenseRequest` with `tagId`.

No breaking changes to existing endpoints — every new field is optional.
