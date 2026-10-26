import {
  daysUntil,
  endOfDayBogota,
  formatDownloadedAt,
  formatLongDate,
  formatShortDate,
  formatTime,
  fromBogotaDateTimeInput,
  toBogotaDateInput,
  toBogotaDateTimeInput,
} from './dates';

describe('dates utils', () => {
  const eventIso = '2026-11-29T15:00:00-05:00';

  it('formats long date in es-CO and America/Bogota', () => {
    expect(formatLongDate(eventIso)).toBe('domingo, 29 de noviembre de 2026');
    // 2026-11-30T02:00:00Z is still 2026-11-29 21:00 in Bogota
    expect(formatLongDate('2026-11-30T02:00:00Z')).toBe('domingo, 29 de noviembre de 2026');
  });

  it('formats short date as "29 nov"', () => {
    expect(formatShortDate(eventIso)).toBe('29 nov');
    expect(formatShortDate('2026-11-30T02:00:00Z')).toBe('29 nov');
  });

  it('formats time in es-CO and America/Bogota', () => {
    expect(formatTime(eventIso)).toBe('3:00 p. m.');
    expect(formatTime('2026-11-29T20:00:00Z')).toBe('3:00 p. m.');
  });

  it('calculates calendar daysUntil in Bogota timezone', () => {
    const sameDayMorning = new Date('2026-11-29T08:00:00-05:00');
    const fiveDaysBefore = new Date('2026-11-24T23:50:00-05:00');
    const oneDayAfter = new Date('2026-11-30T00:10:00-05:00');

    expect(daysUntil(eventIso, sameDayMorning)).toBe(0);
    expect(daysUntil(eventIso, fiveDaysBefore)).toBe(5);
    expect(daysUntil(eventIso, oneDayAfter)).toBe(-1);
  });

  it('returns endOfDayBogota for YYYY-MM-DD', () => {
    expect(endOfDayBogota('2026-11-24')).toBe('2026-11-24T23:59:59-05:00');
  });

  it('converts ISO timestamps to and from Bogota form inputs', () => {
    expect(toBogotaDateInput('2026-11-25T03:00:00Z')).toBe('2026-11-24');
    expect(toBogotaDateTimeInput('2026-11-29T20:00:00Z')).toBe('2026-11-29T15:00');
    expect(fromBogotaDateTimeInput('2026-11-29T15:00')).toBe('2026-11-29T15:00:00-05:00');
  });

  describe('formatDownloadedAt', () => {
    it('formats same Bogota day as "hoy a las {hora}"', () => {
      const now = new Date('2026-11-29T18:00:00-05:00');
      const iso = '2026-11-29T14:15:00-05:00';
      expect(formatDownloadedAt(iso, now)).toBe(`hoy a las ${formatTime(iso)}`);
      expect(formatDownloadedAt(iso, now)).toBe('hoy a las 2:15 p. m.');
    });

    it('formats previous Bogota day as "ayer a las {hora}"', () => {
      const now = new Date('2026-11-29T10:00:00-05:00');
      const iso = '2026-11-28T20:10:00-05:00';
      expect(formatDownloadedAt(iso, now)).toBe(`ayer a las ${formatTime(iso)}`);
      expect(formatDownloadedAt(iso, now)).toBe('ayer a las 8:10 p. m.');
    });

    it('formats another day as "el {día} de {mes} a las {hora}" without year', () => {
      const now = new Date('2026-11-29T10:00:00-05:00');
      const iso = '2026-11-27T08:10:00-05:00';
      expect(formatDownloadedAt(iso, now)).toBe(`el 27 de noviembre a las ${formatTime(iso)}`);
      expect(formatDownloadedAt(iso, now)).toBe('el 27 de noviembre a las 8:10 a. m.');
    });

    it('handles Bogota timezone near midnight correctly', () => {
      // 5 minutes after midnight on Nov 29 in Bogota
      const nowJustAfterMidnight = new Date('2026-11-29T00:05:00-05:00');
      // 5 minutes before midnight on Nov 28 in Bogota
      const isoJustBeforeMidnight = '2026-11-28T23:55:00-05:00';
      expect(formatDownloadedAt(isoJustBeforeMidnight, nowJustAfterMidnight)).toBe(
        `ayer a las ${formatTime(isoJustBeforeMidnight)}`,
      );

      // 5 minutes before midnight on Nov 29 in Bogota
      const nowJustBeforeMidnight = new Date('2026-11-29T23:55:00-05:00');
      // 5 minutes after midnight on Nov 29 in Bogota (same calendar day)
      const isoJustAfterMidnight = '2026-11-29T00:05:00-05:00';
      expect(formatDownloadedAt(isoJustAfterMidnight, nowJustBeforeMidnight)).toBe(
        `hoy a las ${formatTime(isoJustAfterMidnight)}`,
      );

      // UTC timestamp equivalent to Nov 28 23:55 in Bogota
      const utcIso = '2026-11-29T04:55:00Z';
      expect(formatDownloadedAt(utcIso, nowJustAfterMidnight)).toBe(
        `ayer a las ${formatTime(utcIso)}`,
      );
    });
  });
});
