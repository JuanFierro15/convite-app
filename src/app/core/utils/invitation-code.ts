export const INVITATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const INVITATION_CODE_REGEX = new RegExp(`^[${INVITATION_CODE_ALPHABET}]{10}$`);
const VALID_RAW_CHARS_REGEX = /^[A-Za-z0-9\s-]+$/;

export function normalizeInvitationCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function formatInvitationCode(code: string): string {
  const clean = normalizeInvitationCode(code);
  if (clean.length <= 4) {
    return clean;
  }
  if (clean.length <= 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

export function isValidInvitationCode(code: string): boolean {
  const normalized = normalizeInvitationCode(code);
  return INVITATION_CODE_REGEX.test(normalized);
}

export function extractInvitationCode(scanned: string): string | null {
  if (!scanned) {
    return null;
  }

  let candidate: string;
  if (scanned.includes('/i/')) {
    const match = scanned.match(/\/i\/([^/?#]+)/);
    if (!match) {
      return null;
    }
    candidate = match[1];
  } else {
    if (!VALID_RAW_CHARS_REGEX.test(scanned)) {
      return null;
    }
    candidate = scanned;
  }

  const normalized = normalizeInvitationCode(candidate);
  return isValidInvitationCode(normalized) ? normalized : null;
}
