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

export function formatCopInput(
  raw: string,
  caret: number = raw.length,
): { value: string; caret: number } {
  const allDigits = raw.replace(/\D/g, '');
  const digits = allDigits.replace(/^0+(?=\d)/, '');
  const removedZeros = allDigits.length - digits.length;
  const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;
  const digitsToPass = Math.max(0, digitsBeforeCaret - removedZeros);
  const value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // El cursor queda justo después del dígito, antes del punto: si quedara después,
  // borrar hacia atrás solo quitaría el punto, que vuelve a aparecer, y no avanzaría.
  let position = 0;
  for (let passed = 0; passed < digitsToPass; position++) {
    if (value[position] !== '.') {
      passed++;
    }
  }

  return { value, caret: position };
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
