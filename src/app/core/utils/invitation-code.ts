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
