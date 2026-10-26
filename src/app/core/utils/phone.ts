export type PhoneStatus =
  | 'empty'
  | 'incomplete'
  | 'valid'
  | 'too_long'
  | 'not_mobile'
  | 'not_colombia';

export interface PhoneParseResult {
  status: PhoneStatus;
  localDigits: string;
  e164: string | null;
  display: string;
  message: string | null;
}

const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

const HALF_WRITTEN_PREFIXES: Record<string, string> = {
  '+': '+',
  '+5': '+5',
  '0': '0',
  '00': '+',
  '005': '+5',
  '5': '5',
  '57': '+57',
  '+57': '+57',
  '0057': '+57',
};

function formatLocalDigits(local: string): string {
  if (local.length <= 3) {
    return `+57 ${local}`;
  }
  if (local.length <= 6) {
    return `+57 ${local.slice(0, 3)} ${local.slice(3)}`;
  }
  return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export function parsePhoneInput(raw: string | null | undefined): PhoneParseResult {
  if (raw == null) {
    return {
      status: 'empty',
      localDigits: '',
      e164: null,
      display: '',
      message: null,
    };
  }

  const normalized = raw.normalize('NFKC').replace(INVISIBLE_CHARS, '');
  const cleaned = normalized.trim();

  if (cleaned === '') {
    return {
      status: 'empty',
      localDigits: '',
      e164: null,
      display: '',
      message: null,
    };
  }

  const compact = cleaned.replace(/\s+/g, '');

  if (Object.prototype.hasOwnProperty.call(HALF_WRITTEN_PREFIXES, compact)) {
    return {
      status: 'incomplete',
      localDigits: '',
      e164: null,
      display: HALF_WRITTEN_PREFIXES[compact],
      message: 'Faltan 10 dígitos.',
    };
  }

  let hasIntlPrefix = false;
  let digitsAfterPrefix = '';

  if (cleaned.startsWith('+')) {
    hasIntlPrefix = true;
    digitsAfterPrefix = cleaned.slice(1).replace(/\D/g, '');
  } else {
    const allDigits = cleaned.replace(/\D/g, '');
    if (allDigits.startsWith('00')) {
      hasIntlPrefix = true;
      digitsAfterPrefix = allDigits.slice(2);
    } else {
      hasIntlPrefix = false;
      digitsAfterPrefix = allDigits;
    }
  }

  if (digitsAfterPrefix.length === 0) {
    return {
      status: 'incomplete',
      localDigits: '',
      e164: null,
      display: '',
      message: 'Faltan 10 dígitos.',
    };
  }

  if (hasIntlPrefix && !digitsAfterPrefix.startsWith('57')) {
    return {
      status: 'not_colombia',
      localDigits: '',
      e164: null,
      display: `+${digitsAfterPrefix}`,
      message: 'Solo se aceptan celulares de Colombia (+57).',
    };
  }

  let localDigits = '';
  if (digitsAfterPrefix.startsWith('57')) {
    localDigits = digitsAfterPrefix.slice(2);
  } else {
    localDigits = digitsAfterPrefix;
  }

  if (localDigits.length === 0) {
    return {
      status: 'incomplete',
      localDigits: '',
      e164: null,
      display: '+57',
      message: 'Faltan 10 dígitos.',
    };
  }

  if (!localDigits.startsWith('3')) {
    const display = hasIntlPrefix ? `+57${localDigits}` : localDigits;
    return {
      status: 'not_mobile',
      localDigits,
      e164: null,
      display,
      message: 'El celular debe empezar por 3.',
    };
  }

  const display = formatLocalDigits(localDigits);

  if (localDigits.length < 10) {
    const missing = 10 - localDigits.length;
    return {
      status: 'incomplete',
      localDigits,
      e164: null,
      display,
      message: missing === 1 ? 'Falta 1 dígito.' : `Faltan ${missing} dígitos.`,
    };
  }

  if (localDigits.length > 10) {
    const extra = localDigits.length - 10;
    return {
      status: 'too_long',
      localDigits,
      e164: null,
      display,
      message: extra === 1 ? 'Sobra 1 dígito. Revisa el número.' : `Sobran ${extra} dígitos. Revisa el número.`,
    };
  }

  return {
    status: 'valid',
    localDigits,
    e164: `+57${localDigits}`,
    display,
    message: null,
  };
}

export function normalizePhone(input: string | null | undefined): string | null {
  const result = parsePhoneInput(input);
  if (result.status === 'empty') {
    return null;
  }
  if (result.status === 'valid') {
    return result.e164;
  }
  throw new Error('invalid_phone');
}

export function isValidPhone(input: string | null | undefined): boolean {
  return parsePhoneInput(input).status === 'valid';
}

export function formatPhone(stored: string | null | undefined): string {
  if (stored == null) {
    return '';
  }
  const trimmed = stored.trim();
  if (trimmed === '') {
    return '';
  }
  const parsed = parsePhoneInput(stored);
  if (parsed.status === 'valid') {
    return parsed.display;
  }
  return trimmed;
}

export function countDigitsBefore(value: string, caret: number): number {
  if (caret <= 0) {
    return 0;
  }
  const slice = value.slice(0, caret);
  let count = 0;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice.charCodeAt(i);
    if (ch >= 48 && ch <= 57) {
      count++;
    }
  }
  return count;
}

export function caretForDigits(display: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }
  let digitsSeen = 0;
  for (let i = 0; i < display.length; i++) {
    const ch = display.charCodeAt(i);
    if (ch >= 48 && ch <= 57) {
      digitsSeen++;
      if (digitsSeen === digitCount) {
        return i + 1;
      }
    }
  }
  return display.length;
}
