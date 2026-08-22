/**
 * Pure money math for prepaid cards. Kept separate from components so it can be
 * unit-tested in isolation and reused by both quick-add and the load modal.
 *
 * Discount rate is a fraction: 0.30 = 30% off. The discount factor (what you
 * actually pay per unit of face value) is (1 − rate).
 */

/**
 * For a card purchase: given the price tag (face value) and the card's discount
 * rate, estimate the real discounted cost and the amount saved. This is a
 * display estimate — the server computes the exact FIFO cost across tranches.
 */
export function estimateCardCost(faceAmount: number, rate: number): { realCost: number; saved: number } {
  const clampedRate = Math.min(Math.max(rate, 0), 1);
  const realCost = faceAmount * (1 - clampedRate);
  const saved = faceAmount - realCost;
  return { realCost, saved };
}

/**
 * For a load: given the cash paid and the discount rate, how much spendable
 * balance (face value) lands on the card. balance = cash / (1 − rate).
 * At rate 0 the balance equals the cash paid; rate is clamped below 1 to avoid
 * a divide-by-zero.
 */
export function balanceFromCash(cashPaid: number, rate: number): number {
  const clampedRate = Math.min(Math.max(rate, 0), 0.9999);
  const factor = 1 - clampedRate;
  if (factor <= 0) return 0;
  return cashPaid / factor;
}

/**
 * The inverse of balanceFromCash: given the balance (face value) you want on
 * the card and the discount rate, the cash it costs. cash = face × (1 − rate).
 */
export function cashFromBalance(faceValue: number, rate: number): number {
  const clampedRate = Math.min(Math.max(rate, 0), 0.9999);
  return faceValue * (1 - clampedRate);
}

/** Round to 2 decimals for display — mirrors the server's round2. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * How much face value a purchase may spend on a card *while being edited*.
 *
 * A card expense's face value is already drawn down on the card, so `card.balance`
 * (Σ face_remaining) excludes it. Re-planning that same expense on that same card
 * gets to spend it again, so the guard must add it back — otherwise re-saving an
 * unchanged ₪30 purchase on a card showing ₪10 looks like an overdraft.
 *
 * This mirrors the server, which restores the expense's own allocations into the
 * tranche snapshot before re-running FIFO (server/src/routes/expenses.ts, PUT /:id).
 * Face held on a *different* card is not available here: moving the expense plans
 * against the destination card's untouched tranches.
 */
export function spendableCardBalance(
  cardBalance: number,
  cardId: number,
  held: { cardId: number | null; faceAmount: number | null } | null | undefined,
): number {
  const heldFace = held && held.cardId === cardId ? held.faceAmount ?? 0 : 0;
  return round2(cardBalance + heldFace);
}
