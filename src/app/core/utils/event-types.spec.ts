import { EVENT_TYPE_OPTIONS, HONOREE_NAME_MAX, toEventType } from './event-types';

describe('event-types utils', () => {
  it('exports EVENT_TYPE_OPTIONS in the exact order and labels', () => {
    expect(EVENT_TYPE_OPTIONS).toEqual([
      { value: 'baby_shower', label: 'Baby shower' },
      { value: 'baptism', label: 'Bautizo' },
      { value: 'birthday', label: 'Cumpleaños' },
      { value: 'wedding', label: 'Boda' },
      { value: 'anniversary', label: 'Aniversario' },
      { value: 'other', label: 'Otro' },
    ]);
  });

  it('defines HONOREE_NAME_MAX as 60', () => {
    expect(HONOREE_NAME_MAX).toBe(60);
  });

  describe('toEventType', () => {
    it('keeps each of the six valid event types', () => {
      expect(toEventType('baby_shower')).toBe('baby_shower');
      expect(toEventType('baptism')).toBe('baptism');
      expect(toEventType('birthday')).toBe('birthday');
      expect(toEventType('wedding')).toBe('wedding');
      expect(toEventType('anniversary')).toBe('anniversary');
      expect(toEventType('other')).toBe('other');
    });

    it('returns other for unknown, null, undefined, or non-string values', () => {
      expect(toEventType('party')).toBe('other');
      expect(toEventType(null)).toBe('other');
      expect(toEventType(undefined)).toBe('other');
      expect(toEventType(3)).toBe('other');
    });
  });
});
