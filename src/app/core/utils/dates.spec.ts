import {
  daysUntil,
  endOfDayBogota,
  formatDayMonth,
  formatDownloadedAt,
  formatListAge,
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

  it('formats day and month in Bogota timezone', () => {
    expect(formatDayMonth('2026-11-24T23:59:59-05:00')).toBe('24 de noviembre');
    expect(formatDayMonth('2026-11-25T04:59:59Z')).toBe('24 de noviembre');
    expect(formatDayMonth('2026-11-24')).toBe('24 de noviembre');
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

  describe('formatListAge', () => {
    const fixedNow = new Date('2026-11-29T15:30:00-05:00');

    it('returns "hace un momento" for less than 1 minute or in the future', () => {
      // Future
      const future = new Date('2026-11-29T15:31:00-05:00');
      expect(formatListAge(future, fixedNow)).toBe('hace un momento');

      // Exactly now
      expect(formatListAge(fixedNow, fixedNow)).toBe('hace un momento');

      // 30 seconds ago
      const thirtySecAgo = new Date(fixedNow.getTime() - 30_000);
      expect(formatListAge(thirtySecAgo, fixedNow)).toBe('hace un momento');

      // 59 seconds ago
      const fiftyNineSecAgo = new Date(fixedNow.getTime() - 59_000);
      expect(formatListAge(fiftyNineSecAgo, fixedNow)).toBe('hace un momento');
    });

    it('returns "hace X min" for 1 to 59 minutes (floored)', () => {
      // Exactly 1 minute ago
      const oneMinAgo = new Date(fixedNow.getTime() - 60_000);
      expect(formatListAge(oneMinAgo, fixedNow)).toBe('hace 1 min');

      // 1 minute 45 seconds ago -> 1 min
      const oneMinFortyFiveAgo = new Date(fixedNow.getTime() - 105_000);
      expect(formatListAge(oneMinFortyFiveAgo, fixedNow)).toBe('hace 1 min');

      // 12 minutes ago
      const twelveMinAgo = new Date(fixedNow.getTime() - 12 * 60_000);
      expect(formatListAge(twelveMinAgo, fixedNow)).toBe('hace 12 min');

      // 59 minutes and 50 seconds ago -> 59 min
      const fiftyNineMinAgo = new Date(fixedNow.getTime() - (59 * 60_000 + 50_000));
      expect(formatListAge(fiftyNineMinAgo, fixedNow)).toBe('hace 59 min');
    });

    it('returns "hace X h" for 1 to less than 12 hours (floored)', () => {
      // Exactly 1 hour ago
      const oneHourAgo = new Date(fixedNow.getTime() - 60 * 60_000);
      expect(formatListAge(oneHourAgo, fixedNow)).toBe('hace 1 h');

      // 1 hour 30 minutes ago -> 1 h
      const oneHourThirtyAgo = new Date(fixedNow.getTime() - 90 * 60_000);
      expect(formatListAge(oneHourThirtyAgo, fixedNow)).toBe('hace 1 h');

      // 5 hours ago
      const fiveHoursAgo = new Date(fixedNow.getTime() - 5 * 3600_000);
      expect(formatListAge(fiveHoursAgo, fixedNow)).toBe('hace 5 h');

      // 11 hours and 50 minutes ago -> 11 h
      const elevenHoursAgo = new Date(fixedNow.getTime() - (11 * 3600_000 + 50 * 60_000));
      expect(formatListAge(elevenHoursAgo, fixedNow)).toBe('hace 11 h');
    });

    it('delegates to formatDownloadedAt for 12 hours or more', () => {
      // Exactly 12 hours ago (3:30 a. m. on same day)
      const twelveHoursAgo = new Date(fixedNow.getTime() - 12 * 3600_000);
      expect(formatListAge(twelveHoursAgo, fixedNow)).toBe(formatDownloadedAt(twelveHoursAgo, fixedNow));
      expect(formatListAge(twelveHoursAgo, fixedNow)).toBe('hoy a las 3:30 a. m.');

      // Yesterday at 7:40 p. m. (approx 20 hours ago)
      const yesterdayEvening = new Date('2026-11-28T19:40:00-05:00');
      expect(formatListAge(yesterdayEvening, fixedNow)).toBe('ayer a las 7:40 p. m.');
    });
  });
});
