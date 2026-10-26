import { environment } from '../../../environments/environment';
import { guestInvitationUrl } from './guest-link';

describe('guest-link utils', () => {
  it('builds guest invitation url ending in /i/<code> without double slashes', () => {
    const url = guestInvitationUrl('ABCDEFGHJK');
    expect(url.endsWith('/i/ABCDEFGHJK')).toBe(true);
    expect(url).not.toContain('//i/');
    const base = environment.guestBaseUrl.replace(/\/+$/, '');
    expect(url).toBe(`${base}/i/ABCDEFGHJK`);
  });

  it('preserves code without normalizing', () => {
    const rawCode = 'abcd-efgh-jk';
    const url = guestInvitationUrl(rawCode);
    expect(url.endsWith(`/i/${rawCode}`)).toBe(true);
  });
});
