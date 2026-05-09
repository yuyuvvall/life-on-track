/**
 * Single source of truth for monetary display.
 *
 * Use `formatCurrency(amount)` instead of inlining template literals like
 * `\`₪${x.toFixed(2)}\``. A typo such as `\`$${x.toFixed(2)}\`` (where the
 * dollar belongs to the template literal, not the currency) is structurally
 * impossible when the symbol comes from the helper.
 *
 * If the displayed currency ever changes, edit `CURRENCY_SYMBOL` once.
 */
export const CURRENCY_SYMBOL = '₪';

export type FormatCurrencyOptions = {
  /** Insert a single space between the symbol and the number. Default: false. */
  space?: boolean;
  /** Decimal places. Default: 2. */
  decimals?: number;
  /** Use locale grouping (e.g. ₪1,234.56). Default: false. */
  grouping?: boolean;
};

/**
 * Format an amount with the project's currency symbol.
 *
 * @example
 *   formatCurrency(50)                       // "₪50.00"
 *   formatCurrency(50, { space: true })      // "₪ 50.00"
 *   formatCurrency(50, { decimals: 0 })      // "₪50"
 *   formatCurrency(1234.5, { grouping: true }) // "₪1,234.50"
 */
export function formatCurrency(amount: number, opts?: FormatCurrencyOptions): string {
  const decimals = opts?.decimals ?? 2;
  const sep = opts?.space ? ' ' : '';
  const formatted = opts?.grouping
    ? amount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : amount.toFixed(decimals);
  return `${CURRENCY_SYMBOL}${sep}${formatted}`;
}
