import { sanitizeImportedText } from './sanitize';

export type RawCell = string | number | null;

/** Reads the cell mapped to `field` (via a job's columnMapping) out of a raw row array. Undefined if the field wasn't mapped at all. */
export function readMapped(
  row: RawCell[],
  mapping: Record<string, number>,
  field: string,
): RawCell | undefined {
  const index = mapping[field];
  if (index === undefined) return undefined;
  return row[index];
}

export function toStringOrUndefined(value: RawCell | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/** Same as toStringOrUndefined, but neutralizes a leading =/+/-/@ before the value is ever stored (see sanitize.ts). Only for free-text fields actually persisted (name/address/notes/...). */
export function toSanitizedTextOrUndefined(value: RawCell | undefined): string | undefined {
  const text = toStringOrUndefined(value);
  return text === undefined ? undefined : sanitizeImportedText(text);
}

export function toNumberOrUndefined(value: RawCell | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const BARCODE_PATTERN = /^[A-Za-z0-9-]+$/;
export function isValidBarcodeFormat(value: string): boolean {
  return BARCODE_PATTERN.test(value);
}
