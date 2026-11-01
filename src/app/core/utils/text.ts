export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function joinSpanishNames(names: readonly string[]): string {
  const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
  if (cleaned.length === 0) {
    return '';
  }
  if (cleaned.length === 1) {
    return cleaned[0];
  }
  if (cleaned.length === 2) {
    return `${cleaned[0]} y ${cleaned[1]}`;
  }
  const allExceptLast = cleaned.slice(0, -1).join(', ');
  const last = cleaned[cleaned.length - 1];
  return `${allExceptLast} y ${last}`;
}

