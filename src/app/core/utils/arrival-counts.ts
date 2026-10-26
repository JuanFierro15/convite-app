import { Rsvp } from '../models/events';

export interface ArrivalCounts {
  confirmed: number;
  arrivedConfirmed: number;
  arrivedUnconfirmed: number;
  arrivedTotal: number;
}

export function arrivalCounts(
  guests: readonly { rsvp: Rsvp | string; arrived: boolean }[],
): ArrivalCounts {
  let confirmed = 0;
  let arrivedConfirmed = 0;
  let arrivedUnconfirmed = 0;

  for (const guest of guests) {
    if (guest.rsvp === 'accepted') {
      confirmed++;
      if (guest.arrived) {
        arrivedConfirmed++;
      }
    } else if (guest.arrived) {
      arrivedUnconfirmed++;
    }
  }

  return {
    confirmed,
    arrivedConfirmed,
    arrivedUnconfirmed,
    arrivedTotal: arrivedConfirmed + arrivedUnconfirmed,
  };
}
