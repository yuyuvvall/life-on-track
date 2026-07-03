import { describe, it, expect } from 'vitest';
import { estimateCardCost, balanceFromCash, cashFromBalance, round2 } from './cardMath';

describe('estimateCardCost', () => {
  it('discounts the price tag by the rate', () => {
    // ₪100 at 30% off → real ₪70, saved ₪30
    expect(estimateCardCost(100, 0.3)).toEqual({ realCost: 70, saved: 30 });
  });

  it('is a no-op at 0% discount', () => {
    expect(estimateCardCost(100, 0)).toEqual({ realCost: 100, saved: 0 });
  });

  it('clamps an out-of-range rate into [0, 1]', () => {
    expect(estimateCardCost(100, 1.5).realCost).toBe(0);
    expect(estimateCardCost(100, -0.5).realCost).toBe(100);
  });
});

describe('balanceFromCash', () => {
  it('grosses cash up to face value via the rate', () => {
    // Pay ₪700 at 30% off → ₪1000 of balance
    expect(balanceFromCash(700, 0.3)).toBeCloseTo(1000, 6);
  });

  it('returns the cash unchanged at 0%', () => {
    expect(balanceFromCash(700, 0)).toBe(700);
  });

  it('avoids divide-by-zero at extreme rates', () => {
    expect(Number.isFinite(balanceFromCash(700, 1))).toBe(true);
  });
});

describe('cashFromBalance', () => {
  it('is the inverse of balanceFromCash', () => {
    // ₪1000 of balance at 30% off costs ₪700
    expect(cashFromBalance(1000, 0.3)).toBeCloseTo(700, 6);
  });

  it('returns the face unchanged at 0%', () => {
    expect(cashFromBalance(700, 0)).toBe(700);
  });

  it('clamps out-of-range rates like balanceFromCash', () => {
    expect(cashFromBalance(1000, -0.5)).toBe(1000);
    expect(cashFromBalance(1000, 1.5)).toBeCloseTo(1000 * (1 - 0.9999), 6);
  });

  it('round-trips with balanceFromCash', () => {
    for (const [cash, rate] of [
      [700, 0.3],
      [123.45, 0.1],
      [50, 0],
    ] as const) {
      expect(cashFromBalance(balanceFromCash(cash, rate), rate)).toBeCloseTo(cash, 6);
    }
  });
});

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(70.0000001)).toBe(70);
  });
});
