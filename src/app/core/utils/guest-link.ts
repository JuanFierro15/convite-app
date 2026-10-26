import { environment } from '../../../environments/environment';

export function guestInvitationUrl(code: string): string {
  const base = environment.guestBaseUrl.replace(/\/+$/, '');
  return `${base}/i/${code}`;
}
