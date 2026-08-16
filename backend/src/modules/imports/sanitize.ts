const RISKY_LEADING_CHARS = ['=', '+', '-', '@'];

/**
 * Standard CSV/formula-injection mitigation (docs/SECURITY.md "Excel
 * Import"): a cell value that starts with =, +, -, or @ would be evaluated
 * as a formula if this data is ever later re-exported to a spreadsheet and
 * opened in Excel/Sheets by someone else. Prefixing with a single quote
 * neutralizes that without altering the visible text. Applied to every
 * free-text field sourced from an imported row before it reaches a DTO -
 * sku/barcode are unaffected since their own validators already reject
 * anything outside [A-Za-z0-9-].
 */
export function sanitizeImportedText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 0 && RISKY_LEADING_CHARS.includes(trimmed[0])) {
    return `'${trimmed}`;
  }
  return trimmed;
}
