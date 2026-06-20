import type { InValue } from '@libsql/client';
import { trackedExecute } from '../db/index.js';

/**
 * Prepaid-card ledger helpers.
 *
 * A card's spendable balance is *face value* and is derived entirely from its
 * `card_loads` rows (`SUM(face_remaining)`) — it is never stored on the card, so
 * it cannot drift. Each load is a tranche with its own cost factor
 * (`cash_paid / face_value`); a ₪700→₪1000 load has factor 0.70.
 *
 * When a purchase happens we consume face value from the oldest open tranche
 * first (FIFO) and the real cost is the sum of `face_consumed × tranche_factor`.
 * This is what makes the card reconcile to the bank over its lifetime:
 * `Σ real cost of every purchase + real value of the unspent balance = Σ cash loaded`.
 */

const EPS = 1e-9;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface TrancheRow {
  id: number;
  cash_paid: number;
  face_value: number;
  face_remaining: number;
}

export interface Allocation {
  loadId: number;
  faceConsumed: number;
  realCost: number;
}

export interface CardSummary {
  balance: number;            // face value still spendable
  realValueRemaining: number; // prepaid cash still sitting on the card
  totalLoadedCash: number;    // lifetime cash paid into the card
  totalLoadedFace: number;    // lifetime face value loaded
  lifetimeSavings: number;    // totalLoadedFace - totalLoadedCash
}

/** Derive a card's balance and lifetime figures from its load tranches. */
export async function getCardSummary(cardId: number): Promise<CardSummary> {
  const result = await trackedExecute(
    { sql: 'SELECT cash_paid, face_value, face_remaining FROM card_loads WHERE card_id = ?', args: [cardId] },
    'getCardSummary',
  );
  const rows = result.rows as unknown as TrancheRow[];
  let balance = 0;
  let realValueRemaining = 0;
  let totalLoadedCash = 0;
  let totalLoadedFace = 0;
  for (const r of rows) {
    const factor = r.cash_paid / r.face_value;
    balance += r.face_remaining;
    realValueRemaining += r.face_remaining * factor;
    totalLoadedCash += r.cash_paid;
    totalLoadedFace += r.face_value;
  }
  return {
    balance: round2(balance),
    realValueRemaining: round2(realValueRemaining),
    totalLoadedCash: round2(totalLoadedCash),
    totalLoadedFace: round2(totalLoadedFace),
    lifetimeSavings: round2(totalLoadedFace - totalLoadedCash),
  };
}

export type AllocationPlan =
  | { ok: true; realCost: number; allocations: Allocation[]; balance: number }
  | { ok: false; balance: number };

/** All open tranches for a card, oldest first (FIFO order). */
export async function getTranches(cardId: number): Promise<TrancheRow[]> {
  const result = await trackedExecute(
    {
      sql: `SELECT id, cash_paid, face_value, face_remaining
              FROM card_loads
             WHERE card_id = ?
             ORDER BY loaded_at ASC, id ASC`,
      args: [cardId],
    },
    'getCardTranches',
  );
  return result.rows as unknown as TrancheRow[];
}

/** The allocations a given expense currently holds. */
export async function getAllocations(expenseId: number): Promise<Allocation[]> {
  const result = await trackedExecute(
    { sql: 'SELECT load_id, face_consumed, real_cost FROM card_payment_allocations WHERE expense_id = ?', args: [expenseId] },
    'getExpenseAllocations',
  );
  return (result.rows as unknown as { load_id: number; face_consumed: number; real_cost: number }[]).map((r) => ({
    loadId: r.load_id,
    faceConsumed: r.face_consumed,
    realCost: r.real_cost,
  }));
}

/** Pure FIFO planner over a tranche snapshot. No I/O — safe to call after in-memory adjustments. */
export function planAllocationFromTranches(tranches: TrancheRow[], faceAmount: number): AllocationPlan {
  const open = tranches.filter((t) => t.face_remaining > EPS);
  const balance = round2(open.reduce((s, t) => s + t.face_remaining, 0));
  if (faceAmount > balance + EPS) {
    return { ok: false, balance };
  }

  const allocations: Allocation[] = [];
  let remaining = faceAmount;
  let realCost = 0;
  for (const t of open) {
    if (remaining <= EPS) break;
    const take = Math.min(remaining, t.face_remaining);
    const cost = take * (t.cash_paid / t.face_value);
    allocations.push({ loadId: t.id, faceConsumed: take, realCost: round2(cost) });
    realCost += cost;
    remaining -= take;
  }

  return { ok: true, realCost: round2(realCost), allocations, balance };
}

/**
 * Plan (but do not write) the FIFO allocation for a face-value purchase.
 * Returns `ok: false` with the current balance when the card can't cover it.
 */
export async function planAllocation(cardId: number, faceAmount: number): Promise<AllocationPlan> {
  const tranches = await getTranches(cardId);
  return planAllocationFromTranches(tranches, faceAmount);
}

/** Statements that write an expense's allocations and draw down the tranches. */
export function applyAllocationStatements(
  expenseId: number,
  allocations: Allocation[],
): { sql: string; args: InValue[] }[] {
  const statements: { sql: string; args: InValue[] }[] = [];
  for (const a of allocations) {
    statements.push({
      sql: 'INSERT INTO card_payment_allocations (expense_id, load_id, face_consumed, real_cost) VALUES (?, ?, ?, ?)',
      args: [expenseId, a.loadId, a.faceConsumed, a.realCost],
    });
    statements.push({
      sql: 'UPDATE card_loads SET face_remaining = face_remaining + ? WHERE id = ?',
      args: [-a.faceConsumed, a.loadId],
    });
  }
  return statements;
}

/**
 * Statements that reverse a known allocation set: restore the face value back
 * onto the tranches and delete the expense's allocation rows. Returns an empty
 * list when there is nothing to reverse.
 */
export function reverseStatements(
  expenseId: number,
  allocations: Allocation[],
): { sql: string; args: InValue[] }[] {
  if (allocations.length === 0) return [];
  const statements: { sql: string; args: InValue[] }[] = allocations.map((a) => ({
    sql: 'UPDATE card_loads SET face_remaining = face_remaining + ? WHERE id = ?',
    args: [a.faceConsumed, a.loadId],
  }));
  statements.push({
    sql: 'DELETE FROM card_payment_allocations WHERE expense_id = ?',
    args: [expenseId],
  });
  return statements;
}

/**
 * Convenience: read an expense's allocations and build the reversal statements.
 * Safe when the expense has no allocations (returns an empty list).
 */
export async function buildReversalStatements(
  expenseId: number,
): Promise<{ sql: string; args: InValue[] }[]> {
  const allocations = await getAllocations(expenseId);
  return reverseStatements(expenseId, allocations);
}
