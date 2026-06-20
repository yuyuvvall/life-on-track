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
