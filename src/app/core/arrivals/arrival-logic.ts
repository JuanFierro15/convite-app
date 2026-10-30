import { Rsvp } from '../models/events';
import { ArrivalCounts, arrivalCounts } from '../utils/arrival-counts';
import { formatTime } from '../utils/dates';
import { normalizeInvitationCode } from '../utils/invitation-code';
import { normalizeRsvp } from '../utils/invitation-status';
import { normalizeSearchText } from '../utils/text';
import {
  ArrivalGuestView,
  ArrivalInvitationView,
  ArrivalNotice,
  ArrivalSnapshot,
  PendingArrival,
  RecordArrivalResult,
} from './arrival.models';

export const ARRIVAL_RSVP_LABELS: Readonly<Record<Rsvp, string>> = {
  accepted: 'Confirmó',
  declined: 'No asistirá',
  pending: 'Sin respuesta',
};

export type ArrivalRsvpSummaryTone = 'pending' | 'accepted' | 'declined' | 'partial';

export interface ArrivalRsvpSummary {
  tone: ArrivalRsvpSummaryTone;
  text: string;
  accepted: number;
  total: number;
}

export function arrivalRsvpSummary(
  guests: readonly { rsvp: Rsvp | string | null | undefined }[],
): ArrivalRsvpSummary {
  const total = guests.length;
  let accepted = 0;
  let declined = 0;
  let pending = 0;

  for (const guest of guests) {
    const rsvp = normalizeRsvp(guest?.rsvp);
    if (rsvp === 'accepted') {
      accepted += 1;
    } else if (rsvp === 'declined') {
      declined += 1;
    } else {
      pending += 1;
    }
  }

  if (total === 0 || pending === total) {
    return {
      tone: 'pending',
      text: 'Sin respuesta',
      accepted,
      total,
    };
  }

  if (declined === total) {
    return {
      tone: 'declined',
      text: total === 1 ? 'No asistirá' : 'No asistirán',
      accepted,
      total,
    };
  }

  if (accepted === total) {
    return {
      tone: 'accepted',
      text: total === 1 ? 'Confirmó' : `Confirmaron ${total} de ${total}`,
      accepted,
      total,
    };
  }

  return {
    tone: 'partial',
    text: `Confirmaron ${accepted} de ${total}`,
    accepted,
    total,
  };
}

export function buildInvitationViews(
  snapshot: ArrivalSnapshot | null,
  pending: readonly PendingArrival[],
): ArrivalInvitationView[] {
  if (!snapshot) {
    return [];
  }

  const pendingByGuestId = new Map<string, PendingArrival>();
  for (const item of pending) {
    pendingByGuestId.set(item.guestId, item);
  }

  return snapshot.invitations.map((inv) => {
    let arrivedCount = 0;
    const guests: ArrivalGuestView[] = inv.guests.map((guest) => {
      if (guest.arrived_at !== null) {
        arrivedCount++;
        return {
          id: guest.id,
          full_name: guest.full_name,
          rsvp: normalizeRsvp(guest.rsvp),
          arrivedAt: guest.arrived_at,
          synced: true,
        };
      }

      const pendingArrival = pendingByGuestId.get(guest.id);
      if (pendingArrival) {
        arrivedCount++;
        return {
          id: guest.id,
          full_name: guest.full_name,
          rsvp: normalizeRsvp(guest.rsvp),
          arrivedAt: pendingArrival.arrivedAt,
          synced: false,
        };
      }

      return {
        id: guest.id,
        full_name: guest.full_name,
        rsvp: normalizeRsvp(guest.rsvp),
        arrivedAt: null,
        synced: true,
      };
    });

    return {
      id: inv.id,
      code: inv.code,
      group_name: inv.group_name,
      kind: inv.kind,
      guests,
      arrivedCount,
      totalCount: guests.length,
    };
  });
}

export function countsFromViews(views: readonly ArrivalInvitationView[]): ArrivalCounts {
  const guests: { rsvp: ArrivalGuestView['rsvp']; arrived: boolean }[] = [];
  for (const view of views) {
    for (const guest of view.guests) {
      guests.push({
        rsvp: normalizeRsvp(guest.rsvp),
        arrived: guest.arrivedAt !== null,
      });
    }
  }
  return arrivalCounts(guests);
}

export function findInvitationByCode(
  views: readonly ArrivalInvitationView[],
  code: string,
): ArrivalInvitationView | null {
  const targetCode = normalizeInvitationCode(code);
  if (!targetCode) {
    return null;
  }

  for (const view of views) {
    if (normalizeInvitationCode(view.code) === targetCode) {
      return view;
    }
  }

  return null;
}

export function searchInvitations(
  views: readonly ArrivalInvitationView[],
  query: string,
  limit = 20,
): ArrivalInvitationView[] {
  const trimmed = query.trim();
  if (!trimmed || limit <= 0) {
    return [];
  }

  const normalizedQuery = normalizeSearchText(trimmed);
  const normalizedCode = normalizeInvitationCode(trimmed);
  const matchCode = normalizedCode.length >= 4;

  const results: ArrivalInvitationView[] = [];

  for (const view of views) {
    let matches = false;

    if (normalizeSearchText(view.group_name).includes(normalizedQuery)) {
      matches = true;
    } else if (
      view.guests.some((guest) =>
        normalizeSearchText(guest.full_name).includes(normalizedQuery),
      )
    ) {
      matches = true;
    } else if (matchCode && normalizeInvitationCode(view.code).startsWith(normalizedCode)) {
      matches = true;
    }

    if (matches) {
      results.push(view);
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
}

export function enqueueArrivals(
  snapshot: ArrivalSnapshot | null,
  pending: readonly PendingArrival[],
  invitationId: string,
  guestIds: readonly string[],
  recordedBy: string,
  nowIso: string,
): { pending: PendingArrival[]; added: number } {
  if (!snapshot) {
    return { pending: [...pending], added: 0 };
  }

  const invitation = snapshot.invitations.find((inv) => inv.id === invitationId);
  if (!invitation) {
    return { pending: [...pending], added: 0 };
  }

  const pendingGuestIds = new Set(pending.map((item) => item.guestId));
  const guestIdSet = new Set(guestIds);
  const newPending: PendingArrival[] = [];

  for (const guest of invitation.guests) {
    if (
      guestIdSet.has(guest.id) &&
      guest.arrived_at === null &&
      !pendingGuestIds.has(guest.id)
    ) {
      newPending.push({
        guestId: guest.id,
        invitationId,
        arrivedAt: nowIso,
        recordedBy,
      });
      pendingGuestIds.add(guest.id);
    }
  }

  return {
    pending: [...pending, ...newPending],
    added: newPending.length,
  };
}

export function removePending(
  pending: readonly PendingArrival[],
  guestId: string,
): PendingArrival[] {
  return pending.filter((item) => item.guestId !== guestId);
}

export function applyRecordResults(
  snapshot: ArrivalSnapshot | null,
  pending: readonly PendingArrival[],
  results: readonly RecordArrivalResult[],
  currentUserId: string,
  eventId: string,
): {
  snapshot: ArrivalSnapshot | null;
  pending: PendingArrival[];
  notices: ArrivalNotice[];
} {
  const resultGuestIds = new Set(results.map((r) => r.guest_id));
  const newPending = pending.filter((item) => !resultGuestIds.has(item.guestId));

  const guestLookup = new Map<
    string,
    { fullName: string; groupName: string }
  >();

  if (snapshot) {
    for (const inv of snapshot.invitations) {
      for (const guest of inv.guests) {
        guestLookup.set(guest.id, {
          fullName: guest.full_name,
          groupName: inv.group_name,
        });
      }
    }
  }

  const notices: ArrivalNotice[] = [];
  const resultMap = new Map<string, RecordArrivalResult>();

  for (const result of results) {
    resultMap.set(result.guest_id, result);
    const info = guestLookup.get(result.guest_id);
    const fullName = info?.fullName ?? 'Una persona';
    const groupName = info?.groupName ?? '';

    if (
      result.status === 'already_arrived' &&
      result.arrived_by !== currentUserId
    ) {
      const timeFormatted = result.arrived_at ? formatTime(result.arrived_at) : '';
      notices.push({
        eventId,
        guestId: result.guest_id,
        fullName,
        groupName,
        type: 'other_device',
        arrivedAt: result.arrived_at,
        message: `${fullName}: ya tenía llegada registrada desde otro celular (${timeFormatted}).`,
      });
    } else if (result.status === 'not_found') {
      notices.push({
        eventId,
        guestId: result.guest_id,
        fullName,
        groupName,
        type: 'not_found',
        arrivedAt: null,
        message: `${fullName} ya no está en la lista.`,
      });
    }
  }

  let newSnapshot: ArrivalSnapshot | null = null;
  if (snapshot) {
    newSnapshot = {
      ...snapshot,
      invitations: snapshot.invitations.map((inv) => ({
        ...inv,
        guests: inv.guests.map((guest) => {
          const res = resultMap.get(guest.id);
          if (res && (res.status === 'recorded' || res.status === 'already_arrived')) {
            return {
              ...guest,
              arrived_at: res.arrived_at,
              arrived_by: res.arrived_by,
            };
          }
          return guest;
        }),
      })),
    };
  }

  return {
    snapshot: newSnapshot,
    pending: newPending,
    notices,
  };
}

export function classifyScanError(error: unknown): 'cancelled' | 'unavailable' {
  if (!error) {
    return 'unavailable';
  }

  const errObj = typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const message =
    typeof errObj?.['message'] === 'string'
      ? errObj['message']
      : typeof error === 'string'
        ? error
        : '';
  const code =
    typeof errObj?.['code'] === 'string'
      ? errObj['code']
      : typeof errObj?.['code'] === 'number'
        ? String(errObj['code'])
        : '';

  const combined = `${message} ${code}`.toLowerCase();
  if (
    combined.includes('cancel') ||
    code === 'OS-PLUG-BARC-0006' ||
    message.includes('OS-PLUG-BARC-0006')
  ) {
    return 'cancelled';
  }

  return 'unavailable';
}
