import { Rsvp } from '../models/events';
import { InvitationKind } from '../utils/invitation-texts';

export interface ArrivalSnapshotGuest {
  id: string;
  full_name: string;
  rsvp: Rsvp;
  sort_order: number;
  arrived_at: string | null;
  arrived_by: string | null;
}

export interface ArrivalSnapshotInvitation {
  id: string;
  code: string;
  group_name: string;
  kind: InvitationKind;
  guests: ArrivalSnapshotGuest[];
}

export interface ArrivalSnapshot {
  version: 1;
  eventId: string;
  userId: string;
  downloadedAt: string;
  event: { id: string; name: string; theme_id: string; starts_at: string };
  invitations: ArrivalSnapshotInvitation[];
}

export interface PendingArrival {
  guestId: string;
  invitationId: string;
  arrivedAt: string;
  recordedBy: string;
}

export type RecordArrivalStatus = 'recorded' | 'already_arrived' | 'not_found';

export interface RecordArrivalResult {
  guest_id: string;
  status: RecordArrivalStatus;
  arrived_at: string | null;
  arrived_by: string | null;
}

export interface ArrivalGuestView {
  id: string;
  full_name: string;
  rsvp: Rsvp;
  arrivedAt: string | null;
  synced: boolean;
}

export interface ArrivalInvitationView {
  id: string;
  code: string;
  group_name: string;
  kind: InvitationKind;
  guests: ArrivalGuestView[];
  arrivedCount: number;
  totalCount: number;
}

export interface ArrivalNotice {
  eventId: string;
  guestId: string;
  fullName: string;
  groupName: string;
  type: 'other_device' | 'not_found';
  arrivedAt: string | null;
  message: string;
}
