import {
  caretForDigits,
  countDigitsBefore,
  formatPhone,
  isValidPhone,
  normalizePhone,
  parsePhoneInput,
} from './phone';

describe('phone utils', () => {
  describe('valid Colombian mobile numbers', () => {
    const validInputs = [
      '+57 300 123 4567',
      '+573001234567',
      '57 3001234567',
      '573001234567',
      '0057 300 123 4567',
      '0057300 1234567',
      '300-123-4567',
      '(300) 123 4567',
      '300.123.4567',
      '3001234567',
      '+57 (300) 123-4567',
      '300\u00A0123\u00A04567',
      '300\u202F123\u202F4567',
      '300\u2007123\u20074567',
      '300\u2009123\u20094567',
      '\t300 123 4567\n',
      '  +57 300 123 4567  ',
      '\u202A+57 300 123 4567\u202C',
      '\u2066+57 300 123 4567\u2069',
      '\u200E+57 300 123 4567\u200E',
      '\u200F300 123 4567',
      '300\u200B123\u20604567',
      '\uFEFF3001234567',
      '３００１２３４５６７',
    ];

    it.each(validInputs)('accepts "%s" as valid +573001234567', (input) => {
      const parsed = parsePhoneInput(input);
      expect(parsed.status).toBe('valid');
      expect(parsed.e164).toBe('+573001234567');
      expect(parsed.localDigits).toBe('3001234567');
      expect(parsed.display).toBe('+57 300 123 4567');
      expect(parsed.message).toBeNull();

      expect(normalizePhone(input)).toBe('+573001234567');
      expect(isValidPhone(input)).toBe(true);
    });
  });

  describe('invalid inputs with errors', () => {
    it('handles incomplete 9 digits without auto-completing', () => {
      const res = parsePhoneInput('300 123 456');
      expect(res.status).toBe('incomplete');
      expect(res.message).toBe('Falta 1 dígito.');
      expect(res.display).toBe('+57 300 123 456');
      expect(res.e164).toBeNull();
      expect(() => normalizePhone('300 123 456')).toThrowError('invalid_phone');
      expect(isValidPhone('300 123 456')).toBe(false);
    });

    it('handles too_long 11 digits', () => {
      const res = parsePhoneInput('30012345678');
      expect(res.status).toBe('too_long');
      expect(res.message).toBe('Sobra 1 dígito. Revisa el número.');
      expect(res.display).toBe('+57 300 123 45678');
      expect(res.e164).toBeNull();
      expect(() => normalizePhone('30012345678')).toThrowError('invalid_phone');
      expect(isValidPhone('30012345678')).toBe(false);
    });

    it('handles non-mobile numbers', () => {
      const nonMobiles = ['200 123 4567', '601 123 4567', '03001234567'];
      for (const input of nonMobiles) {
        const res = parsePhoneInput(input);
        expect(res.status).toBe('not_mobile');
        expect(res.message).toBe('El celular debe empezar por 3.');
        expect(res.e164).toBeNull();
        expect(() => normalizePhone(input)).toThrowError('invalid_phone');
        expect(isValidPhone(input)).toBe(false);
      }
    });

    it('handles foreign country prefixes', () => {
      const foreign = [
        { input: '+1 300 123 4567', display: '+13001234567' },
        { input: '0044 300 123 4567', display: '+443001234567' },
      ];
      for (const { input, display } of foreign) {
        const res = parsePhoneInput(input);
        expect(res.status).toBe('not_colombia');
        expect(res.message).toBe('Solo se aceptan celulares de Colombia (+57).');
        expect(res.display).toBe(display);
        expect(res.e164).toBeNull();
        expect(() => normalizePhone(input)).toThrowError('invalid_phone');
        expect(isValidPhone(input)).toBe(false);
      }
    });

    it('handles input with no digits as incomplete', () => {
      const res = parsePhoneInput('abc');
      expect(res.status).toBe('incomplete');
      expect(res.message).toBe('Faltan 10 dígitos.');
      expect(res.display).toBe('');
      expect(res.e164).toBeNull();
      expect(() => normalizePhone('abc')).toThrowError('invalid_phone');
      expect(isValidPhone('abc')).toBe(false);
    });
  });

  describe('empty values', () => {
    it('returns empty status for empty, whitespace, null and undefined', () => {
      const emptyInputs = ['', '   ', null, undefined];
      for (const input of emptyInputs) {
        const res = parsePhoneInput(input);
        expect(res).toEqual({
          status: 'empty',
          localDigits: '',
          e164: null,
          display: '',
          message: null,
        });
        expect(normalizePhone(input)).toBeNull();
        expect(isValidPhone(input)).toBe(false);
      }
    });
  });

  describe('live format sequence and half-written prefixes', () => {
    it('formats live typing sequence from 3 up to 10 digits and remains idempotent', () => {
      const sequence = [
        { input: '3', display: '+57 3' },
        { input: '30', display: '+57 30' },
        { input: '300', display: '+57 300' },
        { input: '3001', display: '+57 300 1' },
        { input: '30012', display: '+57 300 12' },
        { input: '300123', display: '+57 300 123' },
        { input: '3001234', display: '+57 300 123 4' },
        { input: '3001234567', display: '+57 300 123 4567' },
      ];

      for (const { input, display } of sequence) {
        const parsed = parsePhoneInput(input);
        expect(parsed.display).toBe(display);
        const reparsed = parsePhoneInput(parsed.display);
        expect(reparsed.display).toBe(display);
      }
    });

    it('formats half-written prefixes according to rule 9', () => {
      const prefixes = [
        { input: '+', display: '+' },
        { input: '+5', display: '+5' },
        { input: '0', display: '0' },
        { input: '00', display: '+' },
        { input: '005', display: '+5' },
        { input: '5', display: '5' },
        { input: '57', display: '+57' },
        { input: '+57', display: '+57' },
        { input: '0057', display: '+57' },
      ];

      for (const { input, display } of prefixes) {
        const parsed = parsePhoneInput(input);
        expect(parsed.status).toBe('incomplete');
        expect(parsed.localDigits).toBe('');
        expect(parsed.e164).toBeNull();
        expect(parsed.message).toBe('Faltan 10 dígitos.');
        expect(parsed.display).toBe(display);
      }
    });
  });

  describe('formatPhone', () => {
    it('formats valid stored numbers and handles empty or raw strings', () => {
      expect(formatPhone('+573001234567')).toBe('+57 300 123 4567');
      expect(formatPhone(null)).toBe('');
      expect(formatPhone('')).toBe('');
      expect(formatPhone('   ')).toBe('');
      expect(formatPhone('texto sin formato')).toBe('texto sin formato');
    });
  });

  describe('cursor helpers', () => {
    it('calculates caretForDigits correctly', () => {
      const display = '+57 300 123 4567';
      expect(caretForDigits(display, 5)).toBe(7);
      expect(caretForDigits(display, 0)).toBe(0);
      expect(caretForDigits(display, -2)).toBe(0);
      expect(caretForDigits(display, 12)).toBe(16);
      expect(caretForDigits(display, 20)).toBe(16);
    });

    it('calculates countDigitsBefore correctly', () => {
      expect(countDigitsBefore('+57 300 1', 6)).toBe(4);
      expect(countDigitsBefore('+57 300 1', 0)).toBe(0);
      expect(countDigitsBefore('+57 300 1', -1)).toBe(0);
    });
  });
});
