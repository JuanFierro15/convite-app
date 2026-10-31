/**
 * @param {string | null | undefined} header  valor de la cabecera Range
 * @param {number} size  tamaño del archivo en bytes
 * @returns {{ type: 'none' } | { type: 'range', start: number, end: number } | { type: 'unsatisfiable' }}
 */
export function parseRange(header, size) {
  if (header == null || typeof header !== 'string') {
    return { type: 'none' };
  }

  const trimmed = header.trim();
  if (trimmed === '') {
    return { type: 'none' };
  }

  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) {
    return { type: 'unsatisfiable' };
  }

  const unit = trimmed.slice(0, eqIndex).trim().toLowerCase();
  if (unit !== 'bytes') {
    return { type: 'unsatisfiable' };
  }

  const rangePart = trimmed.slice(eqIndex + 1);
  const firstRange = rangePart.split(',')[0].trim();
  if (firstRange === '') {
    return { type: 'unsatisfiable' };
  }

  const dashIndex = firstRange.indexOf('-');
  if (dashIndex === -1) {
    return { type: 'unsatisfiable' };
  }
  if (firstRange.indexOf('-', dashIndex + 1) !== -1) {
    return { type: 'unsatisfiable' };
  }

  const partA = firstRange.slice(0, dashIndex).trim();
  const partB = firstRange.slice(dashIndex + 1).trim();

  if (partA === '' && partB === '') {
    return { type: 'unsatisfiable' };
  }

  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    return { type: 'unsatisfiable' };
  }

  const digitsRegex = /^\d+$/;

  if (partA === '') {
    if (!digitsRegex.test(partB)) {
      return { type: 'unsatisfiable' };
    }
    const n = Number(partB);
    if (!Number.isSafeInteger(n) || n === 0) {
      return { type: 'unsatisfiable' };
    }
    const start = Math.max(size - n, 0);
    const end = size - 1;
    return { type: 'range', start, end };
  }

  if (partB === '') {
    if (!digitsRegex.test(partA)) {
      return { type: 'unsatisfiable' };
    }
    const a = Number(partA);
    if (!Number.isSafeInteger(a) || a >= size) {
      return { type: 'unsatisfiable' };
    }
    return { type: 'range', start: a, end: size - 1 };
  }

  if (!digitsRegex.test(partA) || !digitsRegex.test(partB)) {
    return { type: 'unsatisfiable' };
  }
  const a = Number(partA);
  const b = Number(partB);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    return { type: 'unsatisfiable' };
  }
  if (a > b || a >= size) {
    return { type: 'unsatisfiable' };
  }
  const end = Math.min(b, size - 1);
  return { type: 'range', start: a, end };
}
