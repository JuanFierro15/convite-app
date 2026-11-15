import { FIRST_BATCH_LABEL, InvitationBatchRow } from '../models/invitation-batches';
import {
  batchLabel,
  effectiveDeadline,
  latestBatchId,
  nextDeadline,
  sortBatches,
} from './invitation-batches';

function makeBatch(
  overrides: Partial<InvitationBatchRow> & Pick<InvitationBatchRow, 'id' | 'name' | 'rsvp_deadline'>,
): InvitationBatchRow {
  return {
    event_id: 'event-1',
    created_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

describe('invitation-batches utils', () => {
  const eventDeadline = '2026-11-15T23:59:59-05:00';
  const batches = [
    makeBatch({
      id: 'b-1',
      name: 'Segunda tanda',
      rsvp_deadline: '2026-11-18T23:59:59-05:00',
      created_at: '2026-10-02T10:00:00Z',
    }),
    makeBatch({
      id: 'b-2',
      name: 'Tercera tanda',
      rsvp_deadline: '2026-11-22T23:59:59-05:00',
      created_at: '2026-10-03T10:00:00Z',
    }),
    makeBatch({
      id: 'b-3',
      name: 'Cuarta tanda',
      rsvp_deadline: '2026-11-25T23:59:59-05:00',
      created_at: '2026-10-04T10:00:00Z',
    }),
  ];

  describe('sortBatches', () => {
    it('devuelve un arreglo nuevo ordenado por rsvp_deadline ascendente comparando instantes y desempata por created_at', () => {
      const original = [
        makeBatch({
          id: 'b-late',
          name: 'Tarde',
          // 2026-11-20T05:00:00Z = 2026-11-20T00:00:00-05:00
          rsvp_deadline: '2026-11-20T05:00:00Z',
          created_at: '2026-10-01T00:00:00Z',
        }),
        makeBatch({
          id: 'b-tie-2',
          name: 'Empate segunda',
          // 2026-11-19T04:59:59Z = 2026-11-18T23:59:59-05:00
          rsvp_deadline: '2026-11-19T04:59:59Z',
          // 11:30Z = 06:30-05:00, anterior a 07:00-05:00
          created_at: '2026-10-05T11:30:00Z',
        }),
        makeBatch({
          id: 'b-tie-1',
          name: 'Empate primera',
          rsvp_deadline: '2026-11-18T23:59:59-05:00',
          created_at: '2026-10-05T07:00:00-05:00',
        }),
      ];
      const snapshot = original.map((item) => item.id);

      const sorted = sortBatches(original);

      expect(sorted).not.toBe(original);
      expect(original.map((item) => item.id)).toEqual(snapshot);
      expect(sorted.map((item) => item.id)).toEqual(['b-tie-2', 'b-tie-1', 'b-late']);
    });
  });

  describe('effectiveDeadline', () => {
    it('devuelve eventDeadline cuando no hay tandas', () => {
      expect(effectiveDeadline('b-1', [], eventDeadline)).toBe(eventDeadline);
    });

    it('devuelve eventDeadline para batchId null, undefined o desconocido', () => {
      expect(effectiveDeadline(null, batches, eventDeadline)).toBe(eventDeadline);
      expect(effectiveDeadline(undefined, batches, eventDeadline)).toBe(eventDeadline);
      expect(effectiveDeadline('desconocida', batches, eventDeadline)).toBe(eventDeadline);
    });

    it('devuelve la fecha de la tanda para el segundo y el último elemento', () => {
      expect(effectiveDeadline('b-2', batches, eventDeadline)).toBe('2026-11-22T23:59:59-05:00');
      expect(effectiveDeadline('b-3', batches, eventDeadline)).toBe('2026-11-25T23:59:59-05:00');
    });
  });

  describe('batchLabel', () => {
    it('devuelve FIRST_BATCH_LABEL sin tandas o con batchId null, undefined o desconocido', () => {
      expect(batchLabel('b-1', [])).toBe(FIRST_BATCH_LABEL);
      expect(batchLabel(null, batches)).toBe(FIRST_BATCH_LABEL);
      expect(batchLabel(undefined, batches)).toBe(FIRST_BATCH_LABEL);
      expect(batchLabel('desconocida', batches)).toBe(FIRST_BATCH_LABEL);
    });

    it('devuelve el nombre del segundo y del último elemento', () => {
      expect(batchLabel('b-2', batches)).toBe('Tercera tanda');
      expect(batchLabel('b-3', batches)).toBe('Cuarta tanda');
    });
  });

  describe('latestBatchId', () => {
    it('devuelve null sin tandas y el id único con una sola tanda', () => {
      expect(latestBatchId([])).toBeNull();
      expect(latestBatchId([batches[0]])).toBe('b-1');
    });

    it('en caso de empate devuelve la última del arreglo', () => {
      const tied = [
        makeBatch({ id: 'first', name: 'A', rsvp_deadline: '2026-11-20T23:59:59-05:00' }),
        makeBatch({ id: 'middle', name: 'B', rsvp_deadline: '2026-11-18T23:59:59-05:00' }),
        // Mismo instante que 'first', expresado en UTC
        makeBatch({ id: 'last', name: 'C', rsvp_deadline: '2026-11-21T04:59:59Z' }),
      ];

      expect(latestBatchId(tied)).toBe('last');
    });
  });

  describe('nextDeadline', () => {
    it('funciona sin tandas cuando la fecha del evento es futura o pasada', () => {
      const before = new Date('2026-11-10T00:00:00Z');
      const after = new Date('2026-11-20T00:00:00Z');

      expect(nextDeadline(eventDeadline, [], before)).toBe(eventDeadline);
      expect(nextDeadline(eventDeadline, [], after)).toBe(eventDeadline);
    });

    it('considera vigente una fecha exactamente igual a now', () => {
      const exactNow = new Date('2026-11-18T23:59:59-05:00');
      expect(nextDeadline(eventDeadline, batches, exactNow)).toBe('2026-11-18T23:59:59-05:00');
    });

    it('descarta una fecha un milisegundo después de su vencimiento y toma la siguiente', () => {
      const oneMsAfter = new Date(new Date('2026-11-18T23:59:59-05:00').getTime() + 1);
      expect(nextDeadline(eventDeadline, batches, oneMsAfter)).toBe('2026-11-22T23:59:59-05:00');
    });

    it('cuando todas las fechas están en el futuro devuelve la más temprana', () => {
      const earlyNow = new Date('2026-11-01T00:00:00-05:00');
      expect(nextDeadline(eventDeadline, batches, earlyNow)).toBe(eventDeadline);
    });

    it('cuando todas las fechas ya pasaron devuelve la más tardía', () => {
      const lateNow = new Date('2026-11-30T00:00:00-05:00');
      expect(nextDeadline(eventDeadline, batches, lateNow)).toBe('2026-11-25T23:59:59-05:00');
    });

    it('compara instantes entre zonas horarias distintas (-05:00 contra Z) y no cadenas de texto', () => {
      // eventDeadline en UTC: 2026-11-20T06:00:00Z (equivale a 2026-11-20T01:00:00-05:00)
      // tanda en -05:00: 2026-11-20T00:30:00-05:00 (equivale a 2026-11-20T05:30:00Z, anterior al evento aunque el texto empieza igual)
      const utcEvent = '2026-11-20T06:00:00Z';
      const tzBatches = [
        makeBatch({
          id: 'tz-1',
          name: 'Zona Colombia',
          rsvp_deadline: '2026-11-20T00:30:00-05:00',
        }),
      ];

      expect(nextDeadline(utcEvent, tzBatches, new Date('2026-11-20T05:00:00Z'))).toBe(
        '2026-11-20T00:30:00-05:00',
      );
      expect(nextDeadline(utcEvent, tzBatches, new Date('2026-11-20T07:00:00Z'))).toBe(utcEvent);
    });
  });
});
