// Shared display-number formatting — added 2026-08-25 per the user's ask:
// every DISPLAYED (i.e. not directly typed into an input) rupee figure
// across the app uses Indian comma grouping (en-IN — lakh/crore style, e.g.
// "12,34,567.89") and exactly 2 decimal places. This is display-only: input
// fields (Material/Service/Qty/Rate the Location User types) are never
// touched by this — they stay plain absolute numbers, per the explicit
// "amount entered by users is always absolute, never Lakhs" instruction.

/** "12,34,567.89" — Indian digit grouping, exactly 2 decimals, no currency symbol. */
export function formatINR(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "₹12,34,567.89" */
export function formatRupees(value: number): string {
  return `₹${formatINR(value)}`;
}

/**
 * Absolute rupees -> Lakhs, Indian-formatted, 2 decimals, e.g. 1234567.89 ->
 * "12.35 Lakh". Used for every DISPLAYED total in Create Budget (KPI tiles,
 * Sub Head summary, row/grand totals) to match Reports/Home, which have
 * always shown Lakhs — Create Budget was the one screen still showing
 * absolute amounts, fixed 2026-08-25. Never applied to input field values.
 */
export function formatLakh(value: number): string {
  return `₹${formatINR(value / 100000)} Lakh`;
}
