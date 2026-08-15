/** Cents-safe rounding for money computed from floats - avoids artifacts like 39.999999999996 before writing to a Decimal(14,2) column. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
