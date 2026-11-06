import { formatCop, parseCopInput } from './money';

describe('money utils', () => {
  const NBSP = String.fromCharCode(160);

  describe('formatCop', () => {
    it('formats 0 as $ 0 with non-breaking space', () => {
      expect(formatCop(0)).toBe(`$${NBSP}0`);
    });

    it('formats 1', () => {
      expect(formatCop(1)).toBe(`$${NBSP}1`);
    });

    it('formats 999', () => {
      expect(formatCop(999)).toBe(`$${NBSP}999`);
    });

    it('formats 1000 with thousands separator', () => {
      expect(formatCop(1000)).toBe(`$${NBSP}1.000`);
    });

    it('formats 2200000', () => {
      expect(formatCop(2200000)).toBe(`$${NBSP}2.200.000`);
    });

    it('formats 999999999', () => {
      expect(formatCop(999999999)).toBe(`$${NBSP}999.999.999`);
    });

    it('formats negative value as -$ 5.000', () => {
      expect(formatCop(-5000)).toBe(`-$${NBSP}5.000`);
    });

    it('uses String.fromCharCode(160) as space after currency symbol', () => {
      const result = formatCop(50000);
      expect(result.charCodeAt(1)).toBe(160);
      expect(result).toBe(`$${NBSP}50.000`);
    });

    it('rounds decimal values with Math.round', () => {
      expect(formatCop(1234.4)).toBe(`$${NBSP}1.234`);
      expect(formatCop(1234.6)).toBe(`$${NBSP}1.235`);
      expect(formatCop(-1234.6)).toBe(`-$${NBSP}1.235`);
    });
  });

  describe('parseCopInput', () => {
    it('parses plain digit strings', () => {
      expect(parseCopInput('0')).toBe(0);
      expect(parseCopInput('1')).toBe(1);
      expect(parseCopInput('2200000')).toBe(2200000);
      expect(parseCopInput('999999999')).toBe(999999999);
    });

    it('parses formatted COP strings with thousands dots', () => {
      expect(parseCopInput('1.000')).toBe(1000);
      expect(parseCopInput('2.200.000')).toBe(2200000);
      expect(parseCopInput('999.999.999')).toBe(999999999);
    });

    it('trims leading and trailing whitespace', () => {
      expect(parseCopInput('  2.200.000  ')).toBe(2200000);
      expect(parseCopInput(' 50000 ')).toBe(50000);
    });

    it('returns null for empty strings or only whitespace', () => {
      expect(parseCopInput('')).toBeNull();
      expect(parseCopInput('   ')).toBeNull();
    });

    it('returns null for decimals with dot or comma', () => {
      expect(parseCopInput('12.5')).toBeNull();
      expect(parseCopInput('12,5')).toBeNull();
      expect(parseCopInput('1.250,50')).toBeNull();
    });

    it('returns null for text with letters or signs', () => {
      expect(parseCopInput('abc')).toBeNull();
      expect(parseCopInput('100a')).toBeNull();
      expect(parseCopInput('$1000')).toBeNull();
      expect(parseCopInput('-5000')).toBeNull();
      expect(parseCopInput('+100')).toBeNull();
    });

    it('returns null for misplaced dots', () => {
      expect(parseCopInput('1.23.456')).toBeNull();
      expect(parseCopInput('1234.567')).toBeNull();
      expect(parseCopInput('.100')).toBeNull();
      expect(parseCopInput('100.')).toBeNull();
      expect(parseCopInput('1..000')).toBeNull();
    });
  });
});
