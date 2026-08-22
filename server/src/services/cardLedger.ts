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

/** A ledger write. Runs as part of the caller's `db.batch`, never on its own. */
export interface LedgerStatement {
  sql: string;
  args: InValue[];
}

/**
 * Did this error come from a drawdown refusing to overdraw a tranche? The guard
 * writes NULL into a NOT NULL column to abort the batch (SQLite has no RAISE
 * outside a trigger), so that is what a lost race looks like coming back.
 *
 * The file client and Turso word their errors differently — the remote one
 * carries the SQLite code on `err.code` — so check both. Failing to recognise it
 * only costs a 500 instead of a 409: either way the batch rolled back and no
 * balance moved.
 */
export function isCardOverdraw(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code = String((err as { code?: unknown })?.code ?? '');
  const notNull = code === 'SQLITE_CONSTRAINT_NOTNULL' || /NOT NULL constraint failed/i.test(message);
  return notNull && /card_loads|face_remaining/i.test(message);
}

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

/**
 * All tranches for a card, oldest first (FIFO order).
 *
 * Only meaningful while the write lock is held: a snapshot read without it is
 * already stale by the time the plan built from it is written.
 */
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
 * Statements that write an expense's allocations and draw down the tranches.
 *
 * The drawdown re-checks the tranche at write time rather than trusting the plan
 * it came from, so a stale plan aborts the batch instead of leaving
 * `face_remaining` negative. See the guard below.
 */
export function applyAllocationStatements(
  expenseId: number,
  allocations: Allocation[],
): LedgerStatement[] {
  const statements: LedgerStatement[] = [];
  for (const a of allocations) {
    statements.push({
      sql: 'INSERT INTO card_payment_allocations (expense_id, load_id, face_consumed, real_cost) VALUES (?, ?, ?, ?)',
      args: [expenseId, a.loadId, a.faceConsumed, a.realCost],
    });
    // Writing NULL into a NOT NULL column is how a plain statement says "no":
    // SQLite has no RAISE outside a trigger, and the constraint failure aborts
    // the enclosing batch, so a tranche can never go negative even if the plan
    // this came from was stale.
    statements.push({
      sql: `UPDATE card_loads
               SET face_remaining = CASE WHEN face_remaining >= ? - ${EPS}
                                         THEN face_remaining - ?
                                         ELSE NULL END
             WHERE id = ?`,
      args: [a.faceConsumed, a.faceConsumed, a.loadId],
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
): LedgerStatement[] {
  if (allocations.length === 0) return [];
  const statements: LedgerStatement[] = allocations.map((a) => ({
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
export async function buildReversalStatements(expenseId: number): Promise<LedgerStatement[]> {
  const allocations = await getAllocations(expenseId);
  return reverseStatements(expenseId, allocations);
}
