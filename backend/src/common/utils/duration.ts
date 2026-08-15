const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses simple durations like "15m", "30d", "1h" into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`صيغة مدة غير مدعومة: "${value}" (مثال صحيح: "15m", "30d")`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
