import { describe, it, expect } from 'vitest';
import { netAmount } from './expenseMath';

describe('netAmount', () => {
  it('subtracts repayments from the amount', () => {
    // ₪100 expense, friend paid back ₪60 → cost you ₪40
    expect(netAmount({ amount: 100, repaidTotal: 60 })).toBe(40);
  });

  it('equals the amount when nothing was repaid', () => {
    expect(netAmount({ amount: 100, repaidTotal: 0 })).toBe(100);
  });

  it('reaches zero when fully repaid', () => {
    expect(netAmount({ amount: 100, repaidTotal: 100 })).toBe(0);
  });

  it('nets against the real amount for card expenses', () => {
    // face ₪100 at 30% off → stored amount ₪70; ₪30 repaid → net ₪40
    expect(netAmount({ amount: 70, repaidTotal: 30 })).toBe(40);
  });

  it('tolerates a missing repaidTotal from stale caches', () => {
    expect(netAmount({ amount: 100 } as { amount: number; repaidTotal: number })).toBe(100);
  });
});
