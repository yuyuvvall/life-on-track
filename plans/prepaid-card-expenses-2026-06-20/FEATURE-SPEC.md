# Feature Spec: Prepaid Cards (load vs. payment)

**Date:** 2026-06-20
**Status:** Draft for review — accounting model and entry direction confirmed with the user; one open decision flagged below (cost-basis method).
**Scope:** Architecture and UX contract for tracking a prepaid card that is loaded up-front (often at a discount) and then spent like a credit card. Implementation steps belong in a follow-up `PLAN.md`.

---

## The problem

Today every expense is a standalone charge to yourself — no account, no card, no balance. That breaks for a **prepaid card**: you load money onto it (the bank charges you here), then pay with it over days or weeks (you log the expenses here). Two issues fall out:

1. **Bank vs. logs mismatch.** The bank shows the *load* (e.g. ₪700). Your logs show the *purchases* you made with the card. They never line up, because they're different events on different days.
2. **The discount.** The card carries a discount rate (default 30%, but it can change per load). You pay ₪700 and receive ₪1000 of spendable balance. Logging purchases at face value overcounts your real spend by exactly the discount.

## The decision (confirmed)

- **Consumption-basis accounting.** A load is a *transfer of money onto an asset*, not an expense. Each card purchase is logged at its **real, discounted cost**. A ₪100 price tag on a card at 30% off counts as **₪70** of spend. Your category breakdowns and budgets therefore reflect real money paid.
- **Reconciliation horizon.** Because loads and purchases happen on different days, the card reconciles to the bank **over its lifetime, not month-to-month**. The invariant the system guarantees is: *total real cost of all card purchases + real value of the unspent balance = total cash loaded.*
- **Load entry direction: cash → balance.** You type the **cash you paid** plus the rate; the app shows the **balance received**.

---

## Design principles

1. **Keep `expenses.amount` meaning "real money."** This is the load-bearing decision. For a normal expense, `amount` already equals what you paid. For a card purchase, the server stores `amount` = the *discounted real cost* and a new `face_amount` = the *price tag*. Every existing report — category breakdown, timeline, budgets, weekly summary — keeps working untouched, and automatically reflects real (discounted) spend. No downstream query changes.
2. **The card is an account, not a tag.** A card has a balance, a ledger of loads, and links from the expenses paid with it. It is a first-class entity, modeled like `categories` (manager modal, soft-archive, icon/color), not like an `expense_tag` snapshot.
3. **Loads are first-class and dated.** A load records `cash_paid`, `face_value`, the `discount_rate` used, and `loaded_at` (when the bank was charged). This list is the artifact you tick against your bank statement.
4. **Optional everywhere.** `card_id` is nullable on `expenses`. Every flow that doesn't know about cards keeps working exactly as today. A user who never creates a card sees zero change.
5. **Balance is face value; cost is FIFO.** The balance you see (and what a store sees) is face value. The real cost of a purchase is computed from the load(s) it draws down — see the cost-basis section. This is the one place rate-changes get handled correctly.
6. **Reuse existing patterns.** New `cards` routes mirror `categories`/`tags`. Frontend reuses `useOptimisticMutation`, the `request<T>()` client, react-query hooks, the manager-modal shell, BEM CSS, and the quick-add keypad. No new infrastructure.
7. **Block, don't silently break.** Spending past the balance, deleting a partially-consumed load, etc. produce clear warnings — never a corrupted balance.

---

## Data model

### `prepaid_cards` (new table)

```sql
CREATE TABLE IF NOT EXISTS prepaid_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    default_discount_rate REAL NOT NULL DEFAULT 0,   -- 0.30 = 30% off
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prepaid_cards_archived ON prepaid_cards(is_archived);
```

- `default_discount_rate` is the per-card default, pre-filled when loading. It can be overridden on any single load (the user noted the rate "sometimes changes").
- Balance is **not** stored here — it is derived from the load ledger (see below) so it can never drift. The API computes and returns it; the UI never writes it directly.

### `card_loads` (new table — the tranche ledger)

```sql
CREATE TABLE IF NOT EXISTS card_loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES prepaid_cards(id),
    cash_paid REAL NOT NULL CHECK (cash_paid >= 0),   -- what the bank charged, e.g. 700
    face_value REAL NOT NULL CHECK (face_value > 0),   -- balance added, e.g. 1000
    discount_rate REAL NOT NULL,                       -- snapshot at load time, e.g. 0.30
    face_remaining REAL NOT NULL,                       -- for FIFO; starts = face_value
    note TEXT,
    loaded_at DATETIME NOT NULL,                        -- when the bank was charged
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_card_loads_card ON card_loads(card_id, loaded_at);
```

- `factor` (the share of face value you actually paid) = `cash_paid / face_value`. For ₪700→₪1000 that's `0.70`. Stored implicitly via the two columns; `discount_rate = 1 − factor` is kept for display.
- `face_remaining` is decremented as purchases consume the tranche (FIFO). When it hits 0 the tranche is spent.
- **Card balance** = `SUM(face_remaining)` over the card's loads.
- **Real value remaining** = `SUM(face_remaining × cash_paid / face_value)` — the prepaid cash still sitting on the card.

### `expenses` (extend existing table)

```sql
ALTER TABLE expenses ADD COLUMN card_id INTEGER REFERENCES prepaid_cards(id);
ALTER TABLE expenses ADD COLUMN face_amount REAL;   -- price tag for card purchases; NULL for direct expenses
```

- `amount` keeps its current meaning **= real money spent**. For a card purchase it holds the discounted cost (e.g. ₪70); for a direct expense it is unchanged.
- `face_amount` is the price tag the user typed (e.g. ₪100). `NULL` for non-card expenses (or equal to `amount` — `NULL` is cleaner). The UI shows `₪100 → ₪70` when it's present.
- `card_id` is nullable. Existing rows get `NULL` and behave exactly as today.

### `card_payment_allocations` (new table — recommended, see open decision)

Records which tranche(s) a purchase drew from, so edits/deletes can reverse cleanly and so the ledger is auditable.

```sql
CREATE TABLE IF NOT EXISTS card_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    load_id INTEGER NOT NULL REFERENCES card_loads(id),
    face_consumed REAL NOT NULL,    -- face value taken from this tranche
    real_cost REAL NOT NULL,        -- face_consumed × tranche factor
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_card_alloc_expense ON card_payment_allocations(expense_id);
CREATE INDEX IF NOT EXISTS idx_card_alloc_load ON card_payment_allocations(load_id);
```

---

## Cost basis — how a purchase's real cost is computed

This is the only genuinely non-obvious bit, because the discount rate can change between loads. When a ₪100 purchase happens, the server walks the card's loads **oldest-first (FIFO)** and consumes `face_remaining`:

```
Tranche A: loaded ₪700→₪1000 @30%, factor 0.70, ₪40 face left
Tranche B: loaded ₪900→₪1000 @10%, factor 0.90, ₪1000 face left

Buy ₪100 (face):
  take ₪40 from A → real 40 × 0.70 = ₪28,  A.face_remaining → 0
  take ₪60 from B → real 60 × 0.90 = ₪54,  B.face_remaining → 940
  ──────────────────────────────────────
  expense.amount (real) = ₪82
  expense.face_amount   = ₪100
  allocations: {A: 40→28}, {B: 60→54}
```

In the **common case** — one active tranche — this degenerates to `real = face × tranche_factor` (e.g. ₪100 → ₪70), which is exactly what you'd expect. The cross-tranche math only kicks in when a purchase straddles a reload, and FIFO guarantees the lifetime invariant: when the card empties, `Σ real costs = Σ cash loaded`.

> **Open decision — cost-basis method.** FIFO + the allocations table is the recommended approach: it reconciles exactly and handles the changing rate the user called out. A **simpler v1 fallback** is to snapshot the card's current default rate on each purchase (`real = face × (1 − default_rate)`) and skip the allocations table. It's less code but drifts from the bank whenever the rate changes mid-balance, and makes clean reversal of edits harder. **Recommendation: FIFO.** Confirm before building.

---

## API

New routes file `server/src/routes/cards.ts`, mounted at `/cards`, mirroring the `categories`/`tags` shape.

### Cards
| Method | Path | Body / params | Notes |
|---|---|---|---|
| GET | `/cards?includeArchived=1` | — | Returns cards with computed `balance` and `realValueRemaining`. |
| GET | `/cards/:id` | — | Card + recent activity + `dependents` (active load count, lifetime payment count) for delete guards. |
| POST | `/cards` | `{ name, icon, color, defaultDiscountRate }` | Validates rate ∈ [0,1). |
| PUT | `/cards/:id` | `{ name?, icon?, color?, defaultDiscountRate?, isArchived? }` | Rate change affects **future loads only**. |
| DELETE | `/cards/:id` | — | Soft-archive. Warn if `balance ≠ 0`. |

### Loads
| Method | Path | Body / params | Notes |
|---|---|---|---|
| POST | `/cards/:id/loads` | `{ cashPaid, discountRate?, faceValue?, loadedAt?, note? }` | Server computes `faceValue` from `cashPaid` + rate when not given; sets `face_remaining = face_value`. `discountRate` defaults to the card's default. `loadedAt` defaults to now. |
| GET | `/cards/:id/loads` | — | Load history, newest first — the bank-reconciliation list. |
| PUT | `/cards/:id/loads/:loadId` | partial | Allowed only while `face_remaining == face_value` (untouched). Otherwise 409 with a clear message. |
| DELETE | `/cards/:id/loads/:loadId` | — | Allowed only if the tranche is untouched. Otherwise 409. |
| GET | `/cards/:id/activity` | `?start&end` | Unified chronological ledger (loads + payments) for the card-detail view. |

### Payments (extend existing expense endpoints — no new routes)
- `POST /expenses` accepts optional `cardId`. When present, the incoming `amount` is interpreted as the **price tag (face)**; the server runs the FIFO allocation, then stores `amount` = real cost, `face_amount` = face, `card_id`, decrements tranches, and writes allocations — all in one `db.batch()`. Response includes `amount`, `faceAmount`, `cardId`, and the new card balance.
  - Validation: reject if `face > balance` with `{ status: 'fail', message: 'Amount exceeds card balance by ₪X' }` (see edge cases).
- `PUT /expenses/:id`: if `cardId`/amount changes, reverse the old allocations (restore `face_remaining`), then re-apply. Atomic.
- `DELETE /expenses/:id`: reverse allocations and restore `face_remaining` before deleting. `ON DELETE CASCADE` removes the allocation rows.

### Types (`server/src/types.ts` + `client/src/types/index.ts`)
- New: `PrepaidCard { id, name, icon, color, defaultDiscountRate, balance, realValueRemaining, isArchived, createdAt }`, `CardLoad { id, cardId, cashPaid, faceValue, discountRate, faceRemaining, note, loadedAt, createdAt }`, `CardActivityItem` (discriminated union of load | payment).
- Extend `Expense` with `cardId: number | null` and `faceAmount: number | null`.
- Extend `CreateExpenseRequest` / `UpdateExpenseRequest` with `cardId?: number | null` (and treat `amount` as face when `cardId` is set).
- New client API groups `cardsApi` and `cardLoadsApi` in `client/src/api/client.ts`; react-query hooks in a new `client/src/hooks/useCards.ts`.

---

## Frontend / UX

### 1. Quick-add — pick a payment source

The keypad screen (`expense-quick-add.tsx`) gains a **payment-source row** above or beside the category buttons:

```
 ┌─────────────────────────────────────────┐
 │  ₪ 100                                    │   ← you type the price tag
 │  💳 MyCard · real cost ₪70 · saved ₪30    │   ← live helper when a card is picked
 ├───────────────────────────────────────────
 │  Pay with:  [ Direct ]  [ 💳 MyCard ₪970 ] │   ← source toggle; chips show balance
 ├───────────────────────────────────────────
 │  Category buttons …  Tag row …             │
 └───────────────────────────────────────────
```

- Default source is **Direct** — behaves exactly as today (`amount` = real = face).
- Picking a card: the big number becomes the **price tag**; a live line shows `real cost ₪70 · saved ₪30 (30%)` and the card's balance. On save, the server stores the discounted cost.
- If the tag exceeds the balance, the helper turns into a warning and Save is blocked with a "Load card" shortcut.
- Category, note, date, save-as-tag, recurring — all unchanged.

### 2. Load a card

A **"+ Load"** action on each card opens a modal (cash → balance direction):

```
 Load MyCard
 ─────────────────────────────
 Cash paid       [ ₪ 700 ]
 Discount        [  30 % ]   (card default — editable)
 ─────────────────────────────
 Balance you'll get:  ₪1000
 Date charged    [ 2026-06-20 ]
 Note (optional) [ confirmation # ]
        [ Cancel ]   [ Load ]
```

`Date charged` matters — it's what you match against the bank line.

### 3. Card balances on the expenses view

A horizontal strip of card chips at the top of `expenses-view.tsx` (next to the month total): `💳 MyCard ₪970`. Tapping a chip opens the card detail.

### 4. Card detail / reconciliation

Tapping a card shows:
- **Balance** (face) and **real value remaining** (prepaid cash still on the card).
- **Lifetime savings** from the discount — a motivating "hard data" metric that fits the product.
- **Activity ledger** — loads (`+₪1000 for ₪700, 20 Jun`) and payments (`Coffee ₪100 → ₪70`) interleaved.
- **Loads tab** — the clean list to tick against your bank statement, with a running "Loaded this month: ₪700."

### 5. Card manager modal

Create / edit / archive cards (mirrors the category & tag managers): name, icon, color, default discount rate.

### 6. Expense list affordance

Card-paid rows show the card icon and the `₪100 → ₪70` dual amount so it's obvious the logged number is discounted, not a typo.

---

## Edge cases & rules

- **Spend > balance:** blocked by default with `Amount exceeds card balance by ₪X` and a "Load card" shortcut. (No negative balances in v1.)
- **Rate changes:** only affects future loads. Past tranches keep their snapshotted factor — that's why FIFO is per-tranche.
- **Editing/deleting a load that's been spent from:** blocked (409) — the cash already flowed into purchases. The user must adjust the purchases first.
- **Editing/deleting a card purchase:** reverses its allocations and restores `face_remaining`, then re-applies or removes. Atomic via `db.batch()`.
- **Archiving a card with balance left:** allowed but warned; the unspent real value is surfaced so the user knows what they're walking away from.
- **Refunds / negative purchases (money back onto the card):** out of scope for v1 — note as a follow-up.
- **Recurring expenses on a card:** out of scope for v1; recurring stays direct-pay. Revisit once the core flow ships.
- **Multiple cards:** fully supported by the model (the user may add more prepaid cards later).

---

## Out of scope (future)

- Automated bank-statement import / matching — reconciliation is manual (the loads list) for now; no bank integration exists in the codebase.
- Refunds and card-to-card transfers.
- Recurring expenses paid from a card.
- Per-card spending budgets (category budgets already cover this via real cost).

---

## Open decisions for sign-off

1. **Cost-basis method** — FIFO + allocations (recommended, exact) vs. snapshot-default-rate (simpler, drifts on rate changes). *Default: FIFO.*
2. **Currency / symbol** — spec assumes ₪. Confirm the app's display currency so the helper text matches.
3. **Block vs. allow over-spend** — spec blocks spending past the balance. Confirm you never overdraw, or we allow it with a flagged negative tranche.
