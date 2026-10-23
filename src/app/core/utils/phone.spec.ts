import { formatPhone, isValidPhone, normalizePhone } from './phone';

describe('phone utils', () => {
  describe('normalizePhone', () => {
    it('returns null for empty or whitespace strings', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
    });

    it('normalizes 10 digits starting with 3 to +57XXXXXXXXXX', () => {
      expect(normalizePhone('3000000000')).toBe('+573000000000');
      expect(normalizePhone('300 000 0000')).toBe('+573000000000');
      expect(normalizePhone('(300) 000-0000')).toBe('+573000000000');
    });

    it('accepts +57 and 57 prefixes', () => {
      expect(normalizePhone('+573000000000')).toBe('+573000000000');
      expect(normalizePhone('+57 300 000-0000')).toBe('+573000000000');
      expect(normalizePhone('573000000000')).toBe('+573000000000');
      expect(normalizePhone('57 300 000 0000')).toBe('+573000000000');
    });

    it('throws Error("invalid_phone") for invalid phones', () => {
      expect(() => normalizePhone('2000000000')).toThrowError('invalid_phone');
      expect(() => normalizePhone('300000000')).toThrowError('invalid_phone');
      expect(() => normalizePhone('30000000000')).toThrowError('invalid_phone');
      expect(() => normalizePhone('abc')).toThrowError('invalid_phone');
    });
  });

  describe('isValidPhone', () => {
    it('returns true only for valid Colombian mobile numbers', () => {
      expect(isValidPhone('3000000000')).toBe(true);
      expect(isValidPhone('+57 300 000 0000')).toBe(true);
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone('2000000000')).toBe(false);
      expect(isValidPhone('300123')).toBe(false);
    });
  });

  describe('formatPhone', () => {
    it('formats stored +57 phone as 300 000 0000', () => {
      expect(formatPhone('+573000000000')).toBe('300 000 0000');
      expect(formatPhone('3000000000')).toBe('300 000 0000');
      expect(formatPhone(null)).toBe('');
      expect(formatPhone('')).toBe('');
    });
  });
});
