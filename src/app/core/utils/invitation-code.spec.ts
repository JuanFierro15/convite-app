import {
  extractInvitationCode,
  formatInvitationCode,
  isValidInvitationCode,
  normalizeInvitationCode,
} from './invitation-code';

describe('invitation-code utils', () => {
  it('formats 10-character code as ABCD-EFGH-JK', () => {
    expect(formatInvitationCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
    expect(formatInvitationCode('abcd-efgh-jk')).toBe('ABCD-EFGH-JK');
  });

  it('normalizes code by removing non-alphanumeric characters and uppercasing', () => {
    expect(normalizeInvitationCode('abcd-efgh-jk')).toBe('ABCDEFGHJK');
  });

  describe('isValidInvitationCode', () => {
    it('accepts valid 10-character codes using the alphabet', () => {
      expect(isValidInvitationCode('ABCDEFGHJK')).toBe(true);
      expect(isValidInvitationCode('abcd-efgh-jk')).toBe(true);
      expect(isValidInvitationCode('23456789JK')).toBe(true);
    });

    it('rejects codes with characters outside the alphabet', () => {
      expect(isValidInvitationCode('ABCDEFGHJO')).toBe(false); // O
      expect(isValidInvitationCode('ABCDEFGHJI')).toBe(false); // I
      expect(isValidInvitationCode('ABCDEFGHJ0')).toBe(false); // 0
      expect(isValidInvitationCode('ABCDEFGHJ1')).toBe(false); // 1
    });

    it('rejects codes that do not have 10 characters', () => {
      expect(isValidInvitationCode('ABCDEFGHJ')).toBe(false); // 9
      expect(isValidInvitationCode('ABCDEFGHJK2')).toBe(false); // 11
    });
  });

  describe('extractInvitationCode', () => {
    it('extracts code from full url with domain and path', () => {
      expect(extractInvitationCode('https://convite-4v8.pages.dev/i/ABCD-EFGH-JK')).toBe(
        'ABCDEFGHJK',
      );
    });

    it('extracts code from localhost url with trailing subpath', () => {
      expect(extractInvitationCode('http://localhost:8100/i/abcdefghjk/regalos')).toBe(
        'ABCDEFGHJK',
      );
    });

    it('extracts code from url without scheme and with query parameters', () => {
      expect(extractInvitationCode('convite-4v8.pages.dev/i/ABCDEFGHJK?x=1')).toBe(
        'ABCDEFGHJK',
      );
    });

    it('extracts code written directly with hyphens and lowercase', () => {
      expect(extractInvitationCode('abcd-efgh-jk')).toBe('ABCDEFGHJK');
    });

    it('rejects inputs containing characters outside the alphabet', () => {
      expect(extractInvitationCode('ABCD-EFGH-JO')).toBeNull();
      expect(extractInvitationCode('ABCD-EFGH-JI')).toBeNull();
      expect(extractInvitationCode('ABCD-EFGH-J0')).toBeNull();
      expect(extractInvitationCode('ABCD-EFGH-J1')).toBeNull();
    });

    it('rejects codes of 9 and 11 characters', () => {
      expect(extractInvitationCode('ABCD-EFGH-J')).toBeNull();
      expect(extractInvitationCode('ABCD-EFGH-JK2')).toBeNull();
    });

    it('rejects URL without /i/', () => {
      expect(extractInvitationCode('https://convite-4v8.pages.dev/invitaciones')).toBeNull();
    });

    it('rejects empty text and arbitrary text', () => {
      expect(extractInvitationCode('')).toBeNull();
      expect(extractInvitationCode('hola mundo')).toBeNull();
    });
  });
});
