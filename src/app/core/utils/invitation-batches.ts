import { FIRST_BATCH_LABEL, InvitationBatchRow } from '../models/invitation-batches';

type BatchRef = Pick<InvitationBatchRow, 'id' | 'name' | 'rsvp_deadline'>;

export function sortBatches<T extends Pick<InvitationBatchRow, 'rsvp_deadline' | 'created_at'>>(
  batches: readonly T[],
): T[] {
  return [...batches].sort((a, b) => {
    const deadlineDiff =
      new Date(a.rsvp_deadline).getTime() - new Date(b.rsvp_deadline).getTime();
    if (deadlineDiff !== 0) {
      return deadlineDiff;
    }

    const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return a.created_at.localeCompare(b.created_at);
  });
}

export function effectiveDeadline(
  batchId: string | null | undefined,
  batches: readonly BatchRef[],
  eventDeadline: string,
): string {
  if (!batchId) {
    return eventDeadline;
  }

  return batches.find((batch) => batch.id === batchId)?.rsvp_deadline ?? eventDeadline;
}

export function batchLabel(
  batchId: string | null | undefined,
  batches: readonly BatchRef[],
): string {
  if (!batchId) {
    return FIRST_BATCH_LABEL;
  }

  return batches.find((batch) => batch.id === batchId)?.name ?? FIRST_BATCH_LABEL;
}

export function latestBatchId(batches: readonly BatchRef[]): string | null {
  if (batches.length === 0) {
    return null;
  }

  let latest = batches[0];
  let latestTime = new Date(latest.rsvp_deadline).getTime();

  for (let i = 1; i < batches.length; i++) {
    const current = batches[i];
    const currentTime = new Date(current.rsvp_deadline).getTime();
    if (currentTime >= latestTime) {
      latest = current;
      latestTime = currentTime;
    }
  }

  return latest.id;
}

export function nextDeadline(
  eventDeadline: string,
  batches: readonly BatchRef[],
  now: Date = new Date(),
): string {
  const candidates = [eventDeadline, ...batches.map((batch) => batch.rsvp_deadline)];
  const nowTime = now.getTime();

  let earliestUpcoming: { value: string; time: number } | null = null;
  let latestOverall: { value: string; time: number } = {
    value: candidates[0],
    time: new Date(candidates[0]).getTime(),
  };

  for (const candidate of candidates) {
    const time = new Date(candidate).getTime();
    if (time >= nowTime && (!earliestUpcoming || time < earliestUpcoming.time)) {
      earliestUpcoming = { value: candidate, time };
    }
    if (time > latestOverall.time) {
      latestOverall = { value: candidate, time };
    }
  }

  return earliestUpcoming ? earliestUpcoming.value : latestOverall.value;
}
