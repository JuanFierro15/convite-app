import {
  daysUntil,
  endOfDayBogota,
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
});
