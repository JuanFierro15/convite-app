const TEN_DIGIT_COLOMBIA_MOBILE = /^3\d{9}$/;

function extractLocalDigits(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+57')) {
    return cleaned.slice(3);
  }
  if (cleaned.startsWith('57') && cleaned.length === 12) {
    return cleaned.slice(2);
  }
  return cleaned;
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null || input.trim() === '') {
    return null;
  }

  const localDigits = extractLocalDigits(input);
  if (!localDigits || !TEN_DIGIT_COLOMBIA_MOBILE.test(localDigits)) {
    throw new Error('invalid_phone');
  }

  return `+57${localDigits}`;
}

export function isValidPhone(input: string | null | undefined): boolean {
  if (input == null || input.trim() === '') {
    return false;
  }

  try {
    return normalizePhone(input) !== null;
  } catch {
    return false;
  }
}

export function formatPhone(stored: string | null | undefined): string {
  if (!stored || stored.trim() === '') {
    return '';
  }

  const localDigits = extractLocalDigits(stored);
  if (localDigits && TEN_DIGIT_COLOMBIA_MOBILE.test(localDigits)) {
    return `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6, 10)}`;
  }

  return stored.trim();
}
