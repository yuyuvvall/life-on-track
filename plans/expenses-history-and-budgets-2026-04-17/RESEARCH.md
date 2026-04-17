# Research: Expenses — Month History & Category Budgets

**Date:** 2026-04-17
**Scope:** Two features on the expenses screen — (1) navigating to past months, (2) monthly budgets per category rendered into the existing category bars.

---

## Current Expenses Stack (as of 2026-04-17)

### Frontend entry point — [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx)

- Computes the month window once via `useMemo` with `[]` deps at [expenses-view.tsx:41-50](../../client/src/views/expenses-view/expenses-view.tsx#L41-L50):
  ```ts
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  ```
  → `startDate` / `endDate` as `YYYY-MM-DD`, plus a display `monthName`.
- Feeds those into `useExpensesByDateRange(startDate, endDate)` at [expenses-view.tsx:52](../../client/src/views/expenses-view/expenses-view.tsx#L52).
- Local UI state: `viewMode: 'timeline' | 'category'` ([expenses-view.tsx:36](../../client/src/views/expenses-view/expenses-view.tsx#L36)).
- Side effect on mount: fires `generateRecurring.mutate()` unconditionally ([expenses-view.tsx:39](../../client/src/views/expenses-view/expenses-view.tsx#L39)) — relevant because switching to a past month should **not** re-run this (it's a today-only operation).
- Category view renders at [expenses-view.tsx:201-237](../../client/src/views/expenses-view/expenses-view.tsx#L201-L237) — a track + fill bar, width driven by `percentage = (total / totalSpent) * 100` (share-of-wallet, not absolute).
- Summary header at [expenses-view.tsx:123-129](../../client/src/views/expenses-view/expenses-view.tsx#L123-L129) is the natural spot for month nav.

### Data-fetch hook — [useExpenses.ts](../../client/src/hooks/useExpenses.ts)

- `useExpensesByDateRange` at [useExpenses.ts:27-33](../../client/src/hooks/useExpenses.ts#L27-L33) — query key `['expenses', 'range', start, end]`. Key already includes the date window, so **changing `start`/`end` triggers an automatic refetch** with no hook changes required.

### API client — [client.ts](../../client/src/api/client.ts)

- `expensesApi.getByDateRange(start, end)` at [client.ts:148-149](../../client/src/api/client.ts#L148-L149) → `GET /expenses?start=YYYY-MM-DD&end=YYYY-MM-DD`.

### Server route — [expenses.ts](../../server/src/routes/expenses.ts)

- `GET /expenses` at [expenses.ts:38-57](../../server/src/routes/expenses.ts#L38-L57) already filters by date range:
  ```sql
  SELECT * FROM expenses WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC
  ```
  → **No server changes needed for Feature 1.** Any valid date window is accepted.

### Schema — [schema.sql](../../server/src/db/schema.sql)

- `expenses` at [schema.sql:85-91](../../server/src/db/schema.sql#L85-L91): `id`, `amount`, `category TEXT`, `note`, `created_at`. No FK to a categories table.
- Index on `created_at` exists ([schema.sql:120](../../server/src/db/schema.sql#L120)) — past-month queries are already indexed.
- **No `budgets` table.** Categories are free-form strings; the canonical list lives in three places on the client (see below).

### Canonical category list (client-only)

1. [expense-quick-add.tsx:11-20](../../client/src/views/expense-quick-add/expense-quick-add.tsx#L11-L20) — add form (id, icon, color).
2. [expenses-view.tsx:7-27](../../client/src/views/expenses-view/expenses-view.tsx#L7-L27) — display icons + BEM modifiers.
3. [types/index.ts:207-215](../../client/src/types/index.ts#L207-L215) — `EXPENSE_CATEGORIES` constant (missing `Groceries` that the other two lists include — pre-existing drift, not this plan's problem but worth noting).

### Color tokens — [variables.less](../../client/src/styles/variables.less)

Per-category solid color already bound to BEM modifier class `expenses-view__progress-fill--<mod>` at [expenses-view.less:313-327](../../client/src/views/expenses-view/expenses-view.less#L313-L327). For Feature 2 the "faded budget" layer can reuse the same per-category color at low alpha (e.g. `fade(@orange-500, 25%)` via Less).

---

## Problems This Plan Solves

### Feature 1 — Only the current month is visible

Today the view window is computed from `new Date()` with empty deps, so there's no UI path to see past months. Users who want to look back at last month's spending have no way to do it.

### Feature 2 — No budget concept exists

The category bars show share-of-wallet, which is useful but answers "where did my money go" — not "am I on track." Users can't set a monthly ceiling per category and can't see how close they are to it.

---

## Constraints & Assumptions

- **SQLite via libsql / `trackedExecute`** — schema changes go in [schema.sql](../../server/src/db/schema.sql) and are picked up by `initDb` on boot.
- **No auth / multi-user.** Budgets are global (single-user app).
- **Recurring-expense generation** in [expenses-view.tsx:39](../../client/src/views/expenses-view/expenses-view.tsx#L39) runs on mount — it should keep doing that, but must **not** re-fire when the user navigates months.
- **Currency is ₪** (see [expenses-view.tsx:125](../../client/src/views/expenses-view/expenses-view.tsx#L125)); budgets follow suit.
- **Categories remain free-form strings** in the DB. Budgets key on the same string. We accept the existing drift; this plan does not unify the three category lists.

---

## Month-Key Decision

Budgets are scoped to a month. Two viable representations:

| Option | Example | Pro | Con |
|---|---|---|---|
| `YYYY-MM` string | `"2026-04"` | Trivial equality; easy to index; what the UI already formats naturally | Requires a `UNIQUE(category, month)` constraint |
| Date range on the row | `month_start DATE` | Reuses date math | Extra normalization; easier to insert inconsistent values |

→ **Pick `month` as a `TEXT` column with `CHECK(month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')` and a `UNIQUE(category, month)` constraint.** Matches the shape of URL params and React Query keys and needs zero date-math on the server.

---

## Open Questions (answered inline with defaults; flag during implementation if wrong)

1. **Can a user navigate forward past "today"?** Default: **no** — disable the `>` button when `selectedMonth >= currentMonth`. Rationale: there's no data there, and showing "0 spent" for a future month is confusing.
2. **Should the selected month persist across reloads?** Default: **no, session-only.** Keeping it simple; revisit if users complain.
3. **Do budgets carry over to the next month automatically?** **Yes** — a budget set in month X stands for X, X+1, X+2, … until explicitly changed. Implemented in Phase 3 of [PLAN.md](./PLAN.md) via a "latest-wins" server query (`MAX(month) WHERE month <= ?`), with UX that distinguishes "set for this month only" vs "change from now on" when editing an inherited amount.
4. **Where does the user set/edit budgets?** Default: **inline on the category view** — tap the budget line on a category card → modal with amount input. Avoids shipping a whole new route.
5. **What happens if `spent > budget`?** Default: fill bar clamps to 100%, "left" text becomes "₪X over budget" in red. Category color still used for the spent portion; over-budget delta shown in `@red-400`.

---

## Files That Will Change

**Frontend (mostly additive):**
- [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx) — add month state, nav UI, budget-aware bar rendering.
- [expenses-view.less](../../client/src/views/expenses-view/expenses-view.less) — styles for nav chevrons, faded budget layer, "left of budget" text.
- [useExpenses.ts](../../client/src/hooks/useExpenses.ts) — add `useBudgets` / mutation hooks (or new [useBudgets.ts](../../client/src/hooks/useBudgets.ts)).
- [client.ts](../../client/src/api/client.ts) — add `budgetsApi`.
- [types/index.ts](../../client/src/types/index.ts) — add `Budget`, `CreateBudgetRequest`, `UpdateBudgetRequest`.
- New: `client/src/components/budget-edit-modal/` — amount-entry modal for setting/editing a category's budget.

**Backend (additive):**
- [schema.sql](../../server/src/db/schema.sql) — new `category_budgets` table + index.
- New: `server/src/routes/budgets.ts` — CRUD + "get by month" endpoint.
- [index.ts](../../server/src/index.ts) — mount `/api/budgets`.
- [types.ts](../../server/src/types.ts) — `BudgetRow` + `budgetRowToBudget` converter.

No breaking changes to existing endpoints.
