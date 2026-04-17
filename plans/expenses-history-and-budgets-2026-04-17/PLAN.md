# Plan: Expenses — Month History & Category Budgets

**Date:** 2026-04-17
**Scope:** Two features on the expenses screen, deliverable in independent phases.

1. **Month navigation** — arrows on the expenses header to move between past (and current) months.
2. **Category budgets** — set a monthly budget per category; render it as a faded layer inside the existing category bar, with a "left of budget" indicator.

See [RESEARCH.md](./RESEARCH.md) for the code audit that underpins every decision below.

---

## Design Principles

1. **Server already supports date-range filtering.** Feature 1 is purely a client state change plus UI.
2. **Budgets are a new, isolated table.** No migration of the existing `expenses` table, no new FK constraints.
3. **Month-keyed via `YYYY-MM` strings.** Matches React Query keys and URL-param shape; avoids server-side date math.
4. **Reuse existing category color tokens.** Faded budget layer = same hue at low alpha — no new palette.
5. **Inline budget editing on the category card.** No new route; one small modal.
6. **Ship Feature 1 first.** It's a prerequisite for Feature 2 (budgets depend on the selected month) and it unlocks user value immediately.

---

## Phase 1 — Month Navigation

**Goal:** Replace the hardcoded-current-month `useMemo` in [expenses-view.tsx:41-50](../../client/src/views/expenses-view/expenses-view.tsx#L41-L50) with navigable state and UI.

### 1.1 State: track a selected month

In [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx), replace the empty-deps `useMemo` with:

```ts
const [selectedMonth, setSelectedMonth] = useState(() => {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() } // month is 0-indexed
})

const { startDate, endDate, monthName, monthKey, isCurrentMonth } = useMemo(() => {
  const { year, month } = selectedMonth
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const now = new Date()
  return {
    startDate: firstDay.toISOString().split('T')[0],
    endDate:   lastDay.toISOString().split('T')[0],
    monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    monthKey:  `${year}-${String(month + 1).padStart(2, '0')}`, // 'YYYY-MM' for Phase 2
    isCurrentMonth: year === now.getFullYear() && month === now.getMonth(),
  }
}, [selectedMonth])
```

The React Query hook already rekeys on `[start, end]` — no hook changes needed ([useExpenses.ts:27-33](../../client/src/hooks/useExpenses.ts#L27-L33)).

### 1.2 Scope the recurring-generate effect to the current month

The mount-effect at [expenses-view.tsx:39](../../client/src/views/expenses-view/expenses-view.tsx#L39) must stay `[]`-deps (run once) — it isn't bound to the viewed month. No change to the effect itself; just verify nothing in the refactor introduces a dep on `selectedMonth`.

### 1.3 Nav UI in the summary header

Edit [expenses-view.tsx:123-129](../../client/src/views/expenses-view/expenses-view.tsx#L123-L129) to wrap `monthName` with prev/next buttons:

```tsx
<div className="expenses-view__month-nav">
  <button
    className="expenses-view__month-nav-btn"
    onClick={() => setSelectedMonth(prev => shiftMonth(prev, -1))}
    aria-label="Previous month"
  >‹</button>
  <p className="expenses-view__summary-month">{monthName}</p>
  <button
    className="expenses-view__month-nav-btn"
    onClick={() => setSelectedMonth(prev => shiftMonth(prev, +1))}
    disabled={isCurrentMonth}
    aria-label="Next month"
  >›</button>
</div>
```

Add a pure `shiftMonth({year, month}, delta)` helper inside the file (no new util file needed — it's 4 lines).

### 1.4 Fix "this month" copy when viewing the past

`summary-count` and the empty state both say "this month" ([expenses-view.tsx:127,162](../../client/src/views/expenses-view/expenses-view.tsx#L127)). Swap to `isCurrentMonth ? 'this month' : 'in ' + monthName`. Small polish, but otherwise the UI lies.

### 1.5 Styles — [expenses-view.less](../../client/src/views/expenses-view/expenses-view.less)

Add under `&__summary`:

```less
&__month-nav {
  display: flex;
  align-items: center;
  gap: @space-2;
}

&__month-nav-btn {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border: none;
  width: 1.75em;
  height: 1.75em;
  border-radius: @radius-full;
  cursor: pointer;
  font-size: 1em;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
  &:disabled { opacity: 0.35; cursor: default; }
}
```

### 1.6 Acceptance

- Arrows move the header between months; data refetches on each change (visible in Network tab).
- `>` is disabled when viewing the current month.
- Summary copy reads naturally for both current and past months.
- Zero server changes; confirm via `git diff server/`.

---

## Phase 2 — Category Budgets

**Goal:** Persist a per-category monthly budget and render it onto the existing category bar.

Built on top of Phase 1 — the already-computed `monthKey` from 1.1 is the budget key.

### 2.1 Schema — new table in [schema.sql](../../server/src/db/schema.sql)

Append after the `recurring_expenses` block:

```sql
-- 5b. Monthly Category Budgets
CREATE TABLE IF NOT EXISTS category_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    amount REAL NOT NULL CHECK (amount >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, month)
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_month ON category_budgets(month);
```

`initDb` picks this up on next boot.

### 2.2 Backend route — new file `server/src/routes/budgets.ts`

Follow the exact structure of [expenses.ts](../../server/src/routes/expenses.ts) (same error handling, same `trackedExecute` labels, same Swagger JSDoc style).

Endpoints:
- `GET /budgets?month=YYYY-MM` → `Budget[]`
- `POST /budgets` → body `{ category, month, amount }` — **upsert** on `(category, month)` so the client doesn't have to distinguish create vs. update:
  ```sql
  INSERT INTO category_budgets (category, month, amount) VALUES (?, ?, ?)
  ON CONFLICT(category, month) DO UPDATE SET amount = excluded.amount
  ```
- `DELETE /budgets/:id` → remove a budget (for when a user wants to clear it entirely).

No `PUT` — upsert via `POST` is simpler for a single-field resource.

### 2.3 Wire the router — [server/src/index.ts](../../server/src/index.ts)

Add alongside the other `app.use('/api/...', ...)` lines:

```ts
import budgetsRouter from './routes/budgets.js';
// ...
app.use('/api/budgets', budgetsRouter);
```

### 2.4 Types — [server/src/types.ts](../../server/src/types.ts)

Add `BudgetRow` interface and `budgetRowToBudget` converter matching the existing pattern for expenses.

### 2.5 Frontend types — [types/index.ts](../../client/src/types/index.ts)

```ts
export interface Budget {
  id: number;
  category: string;
  month: string;      // 'YYYY-MM'
  amount: number;
  createdAt: string;
}

export interface UpsertBudgetRequest {
  category: string;
  month: string;
  amount: number;
}
```

### 2.6 API client — [client.ts](../../client/src/api/client.ts)

Add after `recurringExpensesApi`:

```ts
export const budgetsApi = {
  getByMonth: (month: string, purpose?: string) =>
    request<Budget[]>(`/budgets?month=${month}`, { purpose }),
  upsert: (data: UpsertBudgetRequest, purpose?: string) =>
    request<Budget>('/budgets', { method: 'POST', body: JSON.stringify(data), purpose }),
  delete: (id: number, purpose?: string) =>
    request<void>(`/budgets/${id}`, { method: 'DELETE', purpose }),
};
```

### 2.7 Hooks — new file `client/src/hooks/useBudgets.ts`

Mirror [useExpenses.ts](../../client/src/hooks/useExpenses.ts) conventions:

```ts
export function useBudgetsByMonth(month: string, purpose = 'View budgets') {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: () => budgetsApi.getByMonth(month, purpose),
    enabled: !!month,
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertBudgetRequest) => budgetsApi.upsert(data, 'Set budget'),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['budgets', vars.month] }),
  });
}

export function useDeleteBudget(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => budgetsApi.delete(id, 'Delete budget'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', month] }),
  });
}
```

Export from [hooks/index.ts](../../client/src/hooks/index.ts).

### 2.8 Merge budget into the category view — [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx)

Add next to the existing `useExpensesByDateRange` call:

```ts
const { data: budgets = [] } = useBudgetsByMonth(monthKey)
const budgetByCategory = useMemo(
  () => Object.fromEntries(budgets.map(b => [b.category, b.amount])),
  [budgets]
)
```

Rework the category card render ([expenses-view.tsx:201-237](../../client/src/views/expenses-view/expenses-view.tsx#L201-L237)) so the bar width means **% of budget**, not % of total, **when a budget is set**. Fallback to share-of-wallet when there's no budget for that category.

```tsx
{categoryBreakdown.map(({ category, total, count }) => {
  const budget = budgetByCategory[category] ?? 0
  const hasBudget = budget > 0
  const spentPct  = hasBudget ? Math.min(100, (total / budget) * 100)
                              : (totalSpent > 0 ? (total / totalSpent) * 100 : 0)
  const remaining = hasBudget ? budget - total : null
  const overBudget = hasBudget && total > budget

  return (
    <div key={category} className="expenses-view__category-card">
      {/* header unchanged */}
      <div className="expenses-view__progress-track">
        {hasBudget && (
          <div className={`expenses-view__progress-budget expenses-view__progress-budget--${mod(category)}`} />
        )}
        <div
          className={`expenses-view__progress-fill expenses-view__progress-fill--${mod(category)}`}
          style={{ width: `${spentPct}%` }}
        />
      </div>
      {hasBudget && (
        <button
          className={`expenses-view__budget-line${overBudget ? ' expenses-view__budget-line--over' : ''}`}
          onClick={() => openBudgetModal(category, budget)}
        >
          {overBudget
            ? `₪ ${(total - budget).toFixed(2)} over ₪${budget.toFixed(2)} budget`
            : `₪ ${remaining!.toFixed(2)} left of ₪${budget.toFixed(2)}`}
        </button>
      )}
      {!hasBudget && (
        <button className="expenses-view__budget-line expenses-view__budget-line--empty"
                onClick={() => openBudgetModal(category, 0)}>
          + Set monthly budget
        </button>
      )}
    </div>
  )
})}
```

### 2.9 Styles — [expenses-view.less](../../client/src/views/expenses-view/expenses-view.less)

The track (`&__progress-track` at [expenses-view.less:306-311](../../client/src/views/expenses-view/expenses-view.less#L306-L311)) needs `position: relative` to host two layers. Add:

```less
&__progress-track { position: relative; }  // extend existing rule

&__progress-budget {
  position: absolute;
  inset: 0;
  border-radius: @radius-full;
  opacity: 0.25;  // the "faded" budget layer — full track width = 100% of budget

  &--food         { background-color: @orange-500; }
  &--groceries    { background-color: @blue-500; }
  &--transport    { background-color: @amber-500; }
  &--shopping     { background-color: @pink-500; }
  &--bills        { background-color: @slate-500; }
  &--entertainment{ background-color: @purple-500; }
  &--health       { background-color: @emerald-500; }
  &--other        { background-color: @gray-500; }
}

&__progress-fill { position: relative; z-index: 1; }  // ensure spent sits on top of budget

&__budget-line {
  display: block;
  margin-top: @space-2;
  background: none;
  border: none;
  padding: 0;
  color: @gray-500;
  font-size: 0.8em;
  cursor: pointer;
  text-align: left;

  &:hover { color: @gray-300; }
  &--over { color: @red-400; font-weight: 600; }
  &--empty { color: @gray-600; }
}
```

### 2.10 Budget edit modal — new `client/src/components/budget-edit-modal/`

Files: `budget-edit-modal.tsx`, `budget-edit-modal.less`, `index.ts`. Single numeric input (reuse the keypad pattern from [expense-quick-add.tsx](../../client/src/views/expense-quick-add/expense-quick-add.tsx) if it's ergonomic, otherwise a plain `<input type="number">`). Save-button calls `useUpsertBudget().mutate({ category, month: monthKey, amount })`; setting amount to 0 + a "Remove" secondary action calls `useDeleteBudget`.

Minimal — this is the smallest possible UI for the feature.

### 2.11 Acceptance

- Setting a budget on `Food` for April 2026 persists in the DB (`SELECT * FROM category_budgets`) and survives reload.
- Viewing the category card for `Food`:
  - Faded orange bar fills the full track (the budget).
  - Solid orange fill shows `spent / budget` as a percentage, clamped at 100%.
  - Line below reads `₪X left of ₪Y` or `₪X over ₪Y budget` when exceeded.
- Navigating to March 2026 swaps the bars to March's budget/spend (React Query key includes `monthKey`, so cache-per-month is automatic).
- Categories without a budget fall back to share-of-wallet rendering — no regression vs. today.

---

## Sequencing & Review Checkpoints

1. **Phase 1 first**, in one PR. It's self-contained and shippable.
2. **Phase 2** in a second PR, ordered:
   - 2.1–2.4 backend (schema → types → route → wire) — can be merged and verified via Swagger/curl before touching the client.
   - 2.5–2.7 client data layer.
   - 2.8–2.10 UI.
3. **Phase 3** in a third PR — no schema change, just the `GET /budgets` query shape, a new "change from now on" endpoint, and the inheritance UX.
4. Verify in browser per phase (CLAUDE.md mandates manual UI verification for frontend changes).

## Phase 3 — Budget Carry-Over to Future Months

**Goal:** A budget set in month X is automatically "in effect" for month X+1, X+2, … until the user explicitly changes it. No nagging the user to re-enter the same ₪1500 food budget every month.

### 3.1 Semantic model — "latest-wins" lookup

A budget row represents the **start** of a standing amount. To find the effective budget for `(category, month)`:

> Return the row with the greatest `month` value that is `≤` the requested month, for that category.

Consequences:
- Setting Food = ₪1500 in `2026-04` makes Food ₪1500 for April, May, June, … forever — until a new row appears.
- Setting Food = ₪1200 in `2026-06` overrides June onward; April and May still resolve to ₪1500.
- Setting Food = ₪0 in `2026-09` explicitly zeroes it from September onward (and renders the same as "no budget" in the UI, but semantically is a decision, not an absence — see §3.4).

This preserves history (past months still show the budget they had at the time) without requiring per-month row duplication.

### 3.2 Server — replace the per-month query with a latest-wins query

Edit `GET /budgets?month=YYYY-MM` in `server/src/routes/budgets.ts` (added in 2.2). Instead of a flat `WHERE month = ?`, use a correlated subquery:

```sql
SELECT b.*
FROM category_budgets b
WHERE b.month = (
  SELECT MAX(month) FROM category_budgets
  WHERE category = b.category AND month <= ?
)
```

This returns one row per category — the most recent at-or-before the requested month. The row's actual `month` field may differ from the query param (it's the month the budget was *set*, not the month it applies to). **The client needs to know both** — see §3.3.

Reuse existing index `idx_category_budgets_month`; the `(category, month)` UNIQUE constraint already gives us the needed ordering. For the current scale (single-user, tens of categories × tens of months) no further indexing is warranted.

Also expose the set month in the response shape — extend `Budget` on the server-to-client converter so clients can tell "set this month" from "inherited".

### 3.3 Client — surface the inherited-vs-set distinction

Extend the `Budget` type in [types/index.ts](../../client/src/types/index.ts) with the set month:

```ts
export interface Budget {
  id: number;
  category: string;
  month: string;       // the month it was SET (not necessarily the month requested)
  amount: number;
  createdAt: string;
}
```

In [expenses-view.tsx](../../client/src/views/expenses-view/expenses-view.tsx), derive whether the effective budget is inherited:

```ts
const budgetInfo = useMemo(() => {
  const map: Record<string, { amount: number; inheritedFromMonth: string | null }> = {}
  for (const b of budgets) {
    map[b.category] = {
      amount: b.amount,
      inheritedFromMonth: b.month !== monthKey ? b.month : null,
    }
  }
  return map
}, [budgets, monthKey])
```

Render a small hint under the budget line when inherited (e.g. `₪1200 left of ₪1500 · carried from Feb 2026`), styled with `.expenses-view__budget-line-inherited { color: @gray-600; font-size: 0.7em; }`. This makes the mental model visible without being loud.

### 3.4 Edit UX — "for this month" vs "from now on"

When the user taps to edit an *inherited* budget, the modal adds a second primary action:

- **"Set for this month only"** — writes a row with `month = monthKey` (new override; future months keep inheriting the prior value, unless another override already exists after this month).
- **"Change from now on"** — also writes a row with `month = monthKey`, but additionally deletes any budget rows for this category where `month > monthKey`, so nothing downstream overrides it.

Add a server endpoint `DELETE /budgets?category=<cat>&after=<month>` (or a dedicated `POST /budgets/change-from-now` that does both writes atomically — preferred, wraps both statements in `trackedExecute` batch). One round-trip is fine since the upsert and cleanup are both keyed the same way.

Editing a "set this month" budget (not inherited) skips this branch — just upsert as in Phase 2. Detect via the `inheritedFromMonth` flag on `budgetInfo`.

### 3.5 Clearing a budget

Two paths:
- **"Remove for this month only"** — for an inherited budget, inserts an `amount = 0` row at `monthKey`. The UI renders zero as "no budget set" visually, but the row exists so future months without their own row still inherit 0 (not the pre-inherited value).
- **"Remove entirely"** — deletes the budget row `AND` any rows for this category where `month >= monthKey`. Effectively erases the "standing order" from this month forward; earlier months keep their history.

### 3.6 Acceptance

- Set Food = ₪1500 for April. Navigate to May — Food bar shows ₪1500 budget with a "carried from Apr 2026" hint. Data verified via `GET /api/budgets?month=2026-05`.
- In May, "Set for this month only" = ₪1000 for Food. June still inherits ₪1500 (from April); May shows ₪1000 with no hint.
- In May, "Change from now on" = ₪1200 for Food. June and later now show ₪1200. April still shows ₪1500 (untouched).
- Past months navigated via Phase 1 always show the amount that was in effect at the time — never rewritten by later changes.
- Setting a brand-new category budget in May with no prior rows behaves exactly like Phase 2 (no hint, no inheritance).

### 3.7 Sequencing note

Phase 3 is additive to Phase 2's endpoints and schema — **no schema change**, only the query shape and a new "change from now on" endpoint. Ship Phase 2 first and let it soak; Phase 3 can land in a follow-up PR without touching the DB.

---

## Sequencing Summary

1. Phase 1 — Month nav (client-only).
2. Phase 2 — Budgets (schema + CRUD + per-month UI).
3. Phase 3 — Carry-over (query change + inheritance UX).

## Out of Scope

- Unifying the three category lists (see [RESEARCH.md](./RESEARCH.md) §"Canonical category list"). Pre-existing drift.
- Budget templates, yearly budgets, proportional carry-over (e.g. rolling unused budget into next month).
- A dedicated "Budgets" route — inline editing is enough for v1.
- Analytics over history (trend lines, month-over-month deltas) — separate feature.
