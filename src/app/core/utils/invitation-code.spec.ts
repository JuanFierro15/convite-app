import { formatInvitationCode, normalizeInvitationCode } from './invitation-code';

describe('invitation-code utils', () => {
  it('formats 10-character code as ABCD-EFGH-JK', () => {
    expect(formatInvitationCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
    expect(formatInvitationCode('abcd-efgh-jk')).toBe('ABCD-EFGH-JK');
  });

  it('normalizes code by removing non-alphanumeric characters and uppercasing', () => {
    expect(normalizeInvitationCode('abcd-efgh-jk')).toBe('ABCDEFGHJK');
  });
});
