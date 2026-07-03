import type { Expense } from '@/types';

/**
 * What the expense actually cost the user after repayments (e.g. a friend
 * paying back their share). `amount` stays true to the bank charge; every
 * total/breakdown should aggregate this net figure instead.
 */
export function netAmount(e: Pick<Expense, 'amount' | 'repaidTotal'>): number {
  return e.amount - (e.repaidTotal ?? 0);
}
