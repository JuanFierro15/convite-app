const NBSP = String.fromCharCode(160);
const PLAIN_DIGITS_REGEX = /^\d+$/;
const FORMATTED_COP_REGEX = /^\d{1,3}(\.\d{3})+$/;

export function formatCop(value: number): string {
  const rounded = Math.round(value);
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return isNegative ? `-$${NBSP}${formatted}` : `$${NBSP}${formatted}`;
}

export function parseCopInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (!PLAIN_DIGITS_REGEX.test(trimmed) && !FORMATTED_COP_REGEX.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replace(/\./g, '');
  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
