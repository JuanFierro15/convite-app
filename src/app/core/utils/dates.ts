const BOGOTA_TIME_ZONE = 'America/Bogota';
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_MINUTES_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATETIME_SECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const SHORT_MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const longDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dayMonthFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  day: 'numeric',
  month: 'long',
});

function parseBogotaAwareDate(iso: string | Date): Date {
  if (iso instanceof Date) {
    return iso;
  }
  const trimmed = iso.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00-05:00`);
  }
  return new Date(trimmed);
}

function getBogotaShiftedDate(iso: string | Date): Date {
  const date = parseBogotaAwareDate(iso);
  return new Date(date.getTime() + BOGOTA_OFFSET_MS);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLongDate(iso: string | Date): string {
  return longDateFormatter.format(parseBogotaAwareDate(iso)).replace(/\s+/g, ' ');
}

export function formatDayMonth(iso: string | Date): string {
  return dayMonthFormatter.format(parseBogotaAwareDate(iso)).replace(/\s+/g, ' ');
}

export function formatShortDate(iso: string | Date): string {
  const shifted = getBogotaShiftedDate(iso);
  const day = shifted.getUTCDate();
  const month = SHORT_MONTHS_ES[shifted.getUTCMonth()];
  return `${day} ${month}`;
}

export function formatTime(iso: string | Date): string {
  return timeFormatter.format(parseBogotaAwareDate(iso)).replace(/\s+/g, ' ');
}

export function daysUntil(iso: string | Date, now: Date = new Date()): number {
  const targetDate = parseBogotaAwareDate(iso);
  const targetBogotaDay = Math.floor((targetDate.getTime() + BOGOTA_OFFSET_MS) / MS_PER_DAY);
  const nowBogotaDay = Math.floor((now.getTime() + BOGOTA_OFFSET_MS) / MS_PER_DAY);
  return targetBogotaDay - nowBogotaDay;
}

export function endOfDayBogota(date: string): string {
  const trimmed = date.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}T23:59:59-05:00`;
  }
  const ymd = toBogotaDateInput(trimmed);
  return `${ymd}T23:59:59-05:00`;
}

export function toBogotaDateInput(iso: string | Date): string {
  if (typeof iso === 'string' && DATE_ONLY_PATTERN.test(iso.trim())) {
    return iso.trim();
  }
  const shifted = getBogotaShiftedDate(iso);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

export function toBogotaDateTimeInput(iso: string | Date): string {
  const shifted = getBogotaShiftedDate(iso);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromBogotaDateTimeInput(value: string): string {
  const trimmed = value.trim();
  if (LOCAL_DATETIME_MINUTES_PATTERN.test(trimmed)) {
    return `${trimmed}:00-05:00`;
  }
  if (LOCAL_DATETIME_SECONDS_PATTERN.test(trimmed)) {
    return `${trimmed}-05:00`;
  }
  const shifted = getBogotaShiftedDate(trimmed);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  const seconds = pad2(shifted.getUTCSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;
}

export function formatDownloadedAt(iso: string | Date, now: Date = new Date()): string {
  const date = parseBogotaAwareDate(iso);
  const diff = daysUntil(date, now);
  const time = formatTime(date);

  if (diff === 0) {
    return `hoy a las ${time}`;
  }
  if (diff === -1) {
    return `ayer a las ${time}`;
  }
  const dayMonth = formatDayMonth(date);
  return `el ${dayMonth} a las ${time}`;
}
