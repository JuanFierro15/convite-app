import { PREVIEW_TIMEOUT_MS } from './config.mjs';

export const GENERIC_TITLE = 'Tienes una invitación';
export const GENERIC_DESCRIPTION = 'Abre el enlace para ver los detalles y confirmar tu asistencia.';
export const DEFAULT_THEME = 'baby-shower';
export const KNOWN_THEMES = ['baby-shower', 'honey-bee'];
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 200;
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Robots-Tag': 'noindex, nofollow',
};

const BOGOTA_TIME_ZONE = 'America/Bogota';
const INVITATION_CTA = 'Abre el enlace para ver tu invitación y confirmar.';

const bogotaDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const bogotaTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function normalizeSpaces(text) {
  return text.replace(/[\u00A0\u202F]/g, ' ');
}

function parseValidDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDateTime(startsAt) {
  const date = parseValidDate(startsAt);
  if (!date) {
    return '';
  }

  const parts = bogotaDateFormatter.formatToParts(date);
  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  if (!weekdayRaw || !day || !month) {
    return '';
  }

  const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
  const formattedDate = normalizeSpaces(`${weekday} ${day} de ${month}`);
  const formattedTime = normalizeSpaces(bogotaTimeFormatter.format(date));
  return `${formattedDate}, ${formattedTime}`;
}

export function normalizeCode(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalized.length < 6 || normalized.length > 16) {
    return null;
  }
  return normalized;
}

export function truncate(text, max) {
  if (typeof text !== 'string' || !(max > 0)) {
    return '';
  }
  const chars = Array.from(text);
  if (chars.length <= max) {
    return text;
  }
  if (max === 1) {
    return '…';
  }
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

export function genericPreview(origin, code) {
  return {
    title: GENERIC_TITLE,
    description: GENERIC_DESCRIPTION,
    image: `${origin}/assets/og/${DEFAULT_THEME}.v1.jpg`,
    url: code ? `${origin}/i/${code}` : `${origin}/`,
  };
}

export function buildPreview(payload, origin, code) {
  const event = payload && typeof payload === 'object' ? payload.event : null;
  if (!event || typeof event !== 'object') {
    return genericPreview(origin, code);
  }

  const rawName = event.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return genericPreview(origin, code);
  }

  const title = truncate(rawName.trim(), TITLE_MAX);
  const dateTime = formatEventDateTime(event.starts_at);
  const venue = typeof event.venue_name === 'string' ? event.venue_name.trim() : '';
  const city = typeof event.city === 'string' ? event.city.trim() : '';
  const place = [venue, city].filter(Boolean).join(', ');
  const summary = [dateTime, place].filter(Boolean).join(' · ');

  let description = GENERIC_DESCRIPTION;
  if (summary) {
    const separator = summary.endsWith('.') ? ' ' : '. ';
    description = truncate(`${summary}${separator}${INVITATION_CTA}`, DESCRIPTION_MAX);
  }

  const theme =
    typeof event.theme_id === 'string' && KNOWN_THEMES.includes(event.theme_id)
      ? event.theme_id
      : DEFAULT_THEME;

  return {
    title,
    description,
    image: `${origin}/assets/og/${theme}.v1.jpg`,
    url: code ? `${origin}/i/${code}` : `${origin}/`,
  };
}

export async function fetchInvitationPreview(
  rawCode,
  origin,
  { fetchImpl = fetch, timeoutMs = PREVIEW_TIMEOUT_MS, supabaseUrl, publishableKey } = {}
) {
  const code = normalizeCode(rawCode);
  if (!code) {
    return genericPreview(origin, null);
  }

  if (
    typeof fetchImpl !== 'function' ||
    typeof supabaseUrl !== 'string' ||
    !supabaseUrl ||
    typeof publishableKey !== 'string' ||
    !publishableKey
  ) {
    return genericPreview(origin, code);
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const effectiveTimeout =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0
      ? timeoutMs
      : PREVIEW_TIMEOUT_MS;
  let timerId;

  const timeoutPromise = new Promise((resolve) => {
    timerId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, effectiveTimeout);
  });

  const rpcPromise = (async () => {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/get_invitation`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_code: code }),
      signal: controller.signal,
    });

    if (!response || !response.ok) {
      if (typeof response?.body?.cancel === 'function') {
        Promise.resolve(response.body.cancel()).catch(() => {});
      }
      return null;
    }

    return await response.json();
  })();

  // Evita rechazos sin manejar si la peticion falla despues de vencer el tiempo limite.
  rpcPromise.catch(() => {});

  try {
    const payload = await Promise.race([rpcPromise, timeoutPromise]);
    if (!payload) {
      return genericPreview(origin, code);
    }
    return buildPreview(payload, origin, code);
  } catch {
    return genericPreview(origin, code);
  } finally {
    clearTimeout(timerId);
  }
}
