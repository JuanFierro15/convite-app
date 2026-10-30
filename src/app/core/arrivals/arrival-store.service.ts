import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { normalizeRsvp } from '../utils/invitation-status';
import { ArrivalSnapshot, PendingArrival } from './arrival.models';

const PREFIX = 'convite.arrivals.';
const SNAPSHOT_SUFFIX = '.snapshot';
const PENDING_SUFFIX = '.pending';

function parseSnapshot(value: string): ArrivalSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<ArrivalSnapshot>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.eventId !== 'string' ||
      !Array.isArray(parsed.invitations)
    ) {
      return null;
    }

    const invitations = parsed.invitations.map((inv) => {
      const rawGuests = Array.isArray(inv?.guests) ? inv.guests : [];
      const guests = rawGuests.map((guest) => ({
        ...guest,
        rsvp: normalizeRsvp(guest?.rsvp),
      }));

      return {
        ...inv,
        guests,
      };
    });

    return {
      ...(parsed as ArrivalSnapshot),
      invitations,
    };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class ArrivalStoreService {
  private readonly chains = new Map<string, Promise<unknown>>();

  private snapshotKey(eventId: string): string {
    return `${PREFIX}${eventId}${SNAPSHOT_SUFFIX}`;
  }

  private pendingKey(eventId: string): string {
    return `${PREFIX}${eventId}${PENDING_SUFFIX}`;
  }

  async read(
    eventId: string,
  ): Promise<{ snapshot: ArrivalSnapshot | null; pending: PendingArrival[] }> {
    let snapshot: ArrivalSnapshot | null = null;
    let pending: PendingArrival[] = [];

    try {
      const { value } = await Preferences.get({ key: this.snapshotKey(eventId) });
      if (value) {
        snapshot = parseSnapshot(value);
      }
    } catch {
      snapshot = null;
    }

    try {
      const { value } = await Preferences.get({ key: this.pendingKey(eventId) });
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          pending = parsed as PendingArrival[];
        }
      }
    } catch {
      pending = [];
    }

    return { snapshot, pending };
  }

  mutate<T>(
    eventId: string,
    fn: (state: { snapshot: ArrivalSnapshot | null; pending: PendingArrival[] }) =>
      | { snapshot?: ArrivalSnapshot | null; pending?: PendingArrival[]; result: T }
      | Promise<{ snapshot?: ArrivalSnapshot | null; pending?: PendingArrival[]; result: T }>,
  ): Promise<T> {
    const previous = this.chains.get(eventId) ?? Promise.resolve();

    const next = previous
      .catch(() => {})
      .then(async () => {
        const current = await this.read(eventId);
        const outcome = await fn(current);

        const writes: Promise<unknown>[] = [];

        if (outcome.snapshot !== undefined) {
          const key = this.snapshotKey(eventId);
          if (outcome.snapshot === null) {
            writes.push(Preferences.remove({ key }));
          } else {
            writes.push(
              Preferences.set({
                key,
                value: JSON.stringify(outcome.snapshot),
              }),
            );
          }
        }

        if (outcome.pending !== undefined) {
          const key = this.pendingKey(eventId);
          if (outcome.pending.length === 0) {
            writes.push(Preferences.remove({ key }));
          } else {
            writes.push(
              Preferences.set({
                key,
                value: JSON.stringify(outcome.pending),
              }),
            );
          }
        }

        await Promise.all(writes);
        return outcome.result;
      });

    this.chains.set(eventId, next);
    return next;
  }

  async listSnapshots(): Promise<ArrivalSnapshot[]> {
    try {
      const { keys } = await Preferences.keys();
      const snapshotKeys = keys.filter(
        (key) => key.startsWith(PREFIX) && key.endsWith(SNAPSHOT_SUFFIX),
      );

      const snapshots: ArrivalSnapshot[] = [];
      for (const key of snapshotKeys) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            const parsed = parseSnapshot(value);
            if (parsed) {
              snapshots.push(parsed);
            }
          }
        } catch {
          // Ignorar snapshot dañado
        }
      }

      return snapshots;
    } catch {
      return [];
    }
  }

  async eventIdsWithPending(): Promise<string[]> {
    try {
      const { keys } = await Preferences.keys();
      const pendingKeys = keys.filter(
        (key) => key.startsWith(PREFIX) && key.endsWith(PENDING_SUFFIX),
      );

      const result: string[] = [];
      for (const key of pendingKeys) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const eventId = key.slice(PREFIX.length, key.length - PENDING_SUFFIX.length);
              result.push(eventId);
            }
          }
        } catch {
          // Ignorar cola dañada
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  async pendingTotal(): Promise<number> {
    try {
      const { keys } = await Preferences.keys();
      const pendingKeys = keys.filter(
        (key) => key.startsWith(PREFIX) && key.endsWith(PENDING_SUFFIX),
      );

      let total = 0;
      for (const key of pendingKeys) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              total += parsed.length;
            }
          }
        } catch {
          // Ignorar cola dañada
        }
      }

      return total;
    } catch {
      return 0;
    }
  }

  async clearAll(): Promise<void> {
    try {
      const { keys } = await Preferences.keys();
      const arrivalsKeys = keys.filter((key) => key.startsWith(PREFIX));
      await Promise.all(arrivalsKeys.map((key) => Preferences.remove({ key })));
    } catch {
      // Ignorar errores al limpiar claves
    }
  }
}
