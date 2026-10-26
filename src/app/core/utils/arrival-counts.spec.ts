import { arrivalCounts } from './arrival-counts';

describe('arrival-counts utils', () => {
  it('returns zeroes for empty list', () => {
    expect(arrivalCounts([])).toEqual({
      confirmed: 0,
      arrivedConfirmed: 0,
      arrivedUnconfirmed: 0,
      arrivedTotal: 0,
    });
  });

  it('handles only accepted guests with arrived and not arrived', () => {
    const guests = [
      { rsvp: 'accepted', arrived: true },
      { rsvp: 'accepted', arrived: false },
      { rsvp: 'accepted', arrived: true },
    ];

    const counts = arrivalCounts(guests);
    expect(counts).toEqual({
      confirmed: 3,
      arrivedConfirmed: 2,
      arrivedUnconfirmed: 0,
      arrivedTotal: 2,
    });
    expect(counts.arrivedTotal).toBe(counts.arrivedConfirmed + counts.arrivedUnconfirmed);
  });

  it('handles mixture of accepted, pending and declined arrivals', () => {
    const guests = [
      { rsvp: 'accepted', arrived: true },
      { rsvp: 'accepted', arrived: false },
      { rsvp: 'pending', arrived: true },
      { rsvp: 'pending', arrived: false },
      { rsvp: 'declined', arrived: true },
      { rsvp: 'declined', arrived: false },
    ];

    const counts = arrivalCounts(guests);
    expect(counts).toEqual({
      confirmed: 2,
      arrivedConfirmed: 1,
      arrivedUnconfirmed: 2,
      arrivedTotal: 3,
    });
    expect(counts.arrivedTotal).toBe(counts.arrivedConfirmed + counts.arrivedUnconfirmed);
  });
});
