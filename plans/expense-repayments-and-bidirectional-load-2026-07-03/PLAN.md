# Expense Repayments + Bidirectional Card Load Entry

## Context

Two additions to the expenses screen:

1. **Repayments ("loan paid")** — A logged expense (e.g. ₪100 food) may be partly a friend's share (₪60). When the friend pays back, the user records a **repayment** against that expense without editing it — `amount` stays true to the bank charge. Confirmed decisions: repayments-only (no upfront debt tracking); **net at expense date** (all totals count `amount − repaidTotal` at the expense's own date); applies to **all** expenses (for card expenses repayments count against real `amount`, never `face_amount`).
2. **Bidirectional load entry** — The card-load modal currently only accepts cash paid (balance is a read-only readout). Make both fields editable: typing either cash or balance computes the other via the discount %.

Per project convention, first copy this plan to `plans/expense-repayments-and-bidirectional-load-2026-07-03/PLAN.md`.

---

## Feature 1 — Expense repayments

### 1. Schema — `server/src/db/index.ts`

New table in the `SCHEMA` string (after `card_payment_allocations`, ~line 187) — new table, so no try/catch ALTER migration needed:

```sql
CREATE TABLE IF NOT EXISTS expense_repayments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount > 0),
    note TEXT,
    repaid_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expense_repayments_expense ON expense_repayments(expense_id);
```

`repaid_at` is display/audit only; aggregation keys to the expense's `created_at`.

### 2. Surface repaid totals — `server/src/routes/expenses.ts:22-24`

Extend the shared `EXPENSE_COLUMNS` projection with a **correlated subquery** (not JOIN+GROUP BY — self-contained, can't multiply rows, safe with the `where.map(...replace(...))` regex rewrite at `:103`; contains no `category_id`/`created_at` tokens; alias inner table `r`, never `c`):

```sql
COALESCE((SELECT SUM(r.amount) FROM expense_repayments r WHERE r.expense_id = expenses.id), 0) AS repaid_total
```

**Export `EXPENSE_COLUMNS`** for reuse in weekly.ts.

### 3. Types — `server/src/types.ts`

- `ExpenseRow` + `repaid_total: number`; `Expense` + `repaidTotal: number`; `expenseRowToExpense` maps `Number(row.repaid_total ?? 0)`.
- New `ExpenseRepaymentRow` / `ExpenseRepayment` (id, expenseId, amount, note, repaidAt, createdAt) + `repaymentRowToRepayment` converter.

### 4. Endpoints — `server/src/routes/expenses.ts` (same router/error style)

| Method/Path | Body | Response |
|---|---|---|
| `GET /api/expenses/:id/repayments` | — | `200 ExpenseRepayment[]` (`repaid_at DESC, id DESC`); 404 if expense missing |
| `POST /api/expenses/:id/repayments` | `{ amount, note?, repaidAt? }` | `201 { repayment, expense }` (fresh expense carries updated `repaidTotal`, mirroring the `{ load, card }` pattern) |
| `DELETE /api/expenses/:id/repayments/:repaymentId` | — | `204`; 404 if not found for that expense |

POST validation (reuse `round2` from cardLedger, EPS = 1e-9): amount finite > 0, stored via `round2`; reject when `round2(repaid_total + amount) > expense.amount + EPS` → `400 "Repayment exceeds remaining ₪X"`. `repaidAt` defaults to now. Plain `trackedExecute` writes — repayments never touch the card ledger.

### 5. Expense PUT/DELETE interaction

- **DELETE**: no change — FK cascade removes repayments (same as allocations).
- **PUT** (`expenses.ts:303-440`): reject edits dropping the final stored amount below repaid total (user must delete repayments first). Track `finalStoredAmount` across the three branches — plain edit (`amount`), card realloc (`plan.realCost`, only known post-planning ~`:399`), card→direct (`newAmount` ~`:406`) — and guard once before the `db.batch`: `400 "New amount is below the ₪X already repaid. Delete repayments first."`

### 6. All `expenses.amount` aggregation consumers → net

**Server — `server/src/routes/weekly.ts:44-62`**: replace the inline projection with the imported `EXPENSE_COLUMNS` (its FROM/JOIN is identical; today it's also missing the card columns — consolidation fixes that drift too). Sum `exp.amount - exp.repaid_total` into `expensesByCategory` and `totalExpenses`. That automatically fixes client consumers of `WeeklySummary` (closing-event-view, spending-chart).

**No-change (verified)**: `categories.ts` (COUNTs only), `budgets.ts`/`recurringExpenses.ts` (no expense sums), `cards.ts` activity + `card-detail-modal` (card ledger reconciles to cash loaded — must stay gross; add a comment). `swagger.ts`: add `repaidTotal` + repayment schema (cosmetic).

**Client — new `client/src/utils/expenseMath.ts`**: `netAmount = (e) => e.amount - (e.repaidTotal ?? 0)`. Use it in `expenses-view.tsx`:
- `totalSpent` (~:349), `categoryBreakdown` (~:275, budget/wallet-share bars derive from it), `tagBreakdown` (~:300), `tagBreakdownByCategory` (~:326).
- Delete-undo toast keeps `expense.amount` (bank truth); undo already loses cardId/tagId — repayments likewise, comment it.

### 7. Client types / api / hooks

- `client/src/types/index.ts`: `Expense.repaidTotal`; `ExpenseRepayment`; `CreateRepaymentRequest/Response`.
- `client/src/api/client.ts` (`expensesApi`): `getRepayments`, `addRepayment`, `deleteRepayment`.
- `client/src/hooks/useExpenses.ts`: `useExpenseRepayments(expenseId)` (key `['expenses', id, 'repayments']`), `useAddRepayment` / `useDeleteRepayment` (plain mutations invalidating `['expenses']` + `['weeklySummary']`).

### 8. Client UX

**New `client/src/components/repayment-modal/`** (tsx + less + index.ts, follow `card-load-modal` structure): header with category + original amount; list of repayments (amount, note, date, × delete); "remaining ₪X" readout; add form `{ amount, note (placeholder "who / what"), repaidAt (default today) }`, client-side `0 < amount ≤ remaining`; toasts via `showToast`.

**Entry point** — `expense-quick-add.tsx` edit mode only: compact button near the amount section, `↩ Repaid ₪60` (or `↩ Add repayment`), opening the modal.

**Row display** — `expenses-view.tsx` (~:576-593): original amount stays primary; when `repaidTotal > 0` add a muted line `↩ ₪60 repaid · net ₪40` (`expenses-view__expense-repaid` in `.less`). For card rows it sits beneath the existing `💳 ₪100 → ₪70` line, net on real-money basis.

---

## Feature 2 — Bidirectional card load entry

### 1. `client/src/utils/cardMath.ts`

Add inverse (mirror `balanceFromCash` style/clamping): `cashFromBalance(faceValue, rate) = faceValue * (1 - clampedRate)`.

### 2. `client/src/components/card-load-modal/card-load-modal.tsx` (+ `.less`)

- `FormValues` + `balanceReceived: string`; replace the read-only readout (`:142-145`) with an editable "Balance received" input paired with Cash paid.
- `const [lastEdited, setLastEdited] = useState<'cash' | 'face'>('cash')` + `setValue` from `useForm`.
- Recompute **only from user `onChange` handlers in register options** (not `watch` effects — avoids `setValue` feedback loops); round display values with `round2`:
  - cash edit → set balance = `balanceFromCash(cash, rate)`
  - balance edit → set cash = `cashFromBalance(face, rate)`
  - discount % edit → recompute the non-driving field per `lastEdited`
  - Guard with `Number.isFinite`; clear counterpart on empty/NaN instead of writing "NaN".
- Validation: cash > 0, face > 0, **face ≥ cash** ("balance received cannot be less than cash paid" — mirrors server rule `cards.ts:364`), pct ∈ [0,100).
- Submit:
  - `lastEdited === 'face'` → send `{ cashPaid, faceValue, loadedAt, note }`, omit `discountRate` — server (`cards.ts:359-368`) stores the typed face exactly and derives the rate; no rounding drift.
  - `lastEdited === 'cash'` → unchanged `{ cashPaid, discountRate, loadedAt, note }`.
  - Success toast: use the form's balance value instead of recomputing (`:71`).
- `CreateCardLoadRequest` already has optional `faceValue` — no type change. No edit-load UI exists (`cardsApi.updateLoad` is uncalled) — nothing else to touch; leave a one-line note.

---

## Implementation order

1. Copy plan to `plans/expense-repayments-and-bidirectional-load-2026-07-03/PLAN.md`.
2. Server: schema → types → expenses.ts (projection + endpoints + PUT guard) → weekly.ts.
3. Client: types/api/hooks → expenseMath + expenses-view net sums + row indicator → repayment-modal + quick-add hook-in.
4. Feature 2: cardMath (+tests) → card-load-modal.

## Verification

- `npm run dev` at repo root (server auto-applies schema to local `file:./data/auditor.db`; watch for "Schema initialized successfully").
- Client tests: extend `cardMath.test.ts` (`cashFromBalance(1000, 0.3) ≈ 700`, identity at 0, round-trip with `balanceFromCash`); new `expenseMath.test.ts`.
- API (curl): repay 60 on a ₪100 expense → `repaidTotal: 60`; repay 41 → 400, repay 40 → 201; PUT amount → 50 while repaid 60 → 400; DELETE expense cascades repayment rows; card expense (face 100/real 70): repay 70 OK, 71 → 400, card balance untouched; weekly totals net at expense's week even when `repaidAt` falls in another week; load POST `{cashPaid:700, faceValue:1000}` → rate 0.30.
- UI: breakdowns/month total drop by repaid amounts; row shows `↩ repaid · net` line (direct + card rows); repayment modal add/delete round-trips; load modal: type balance → cash fills, type cash → balance fills, % change updates non-driving field, face < cash blocked.

## Risks

- The `EXPENSE_COLUMNS` regex rewrite at `expenses.ts:103` — subquery must avoid `category_id`/`created_at` tokens and the `c` alias.
- PUT guard placement: `plan.realCost` only exists after `planAllocationFromTranches`; guard must sit after branch resolution, before the batch.
- weekly.ts must consolidate on the exported projection — otherwise its converter defaults `repaidTotal` to 0 and weekly sums silently stay gross.
