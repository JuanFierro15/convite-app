import { DestroyRef, Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type RealtimeTable =
  | 'events'
  | 'invitations'
  | 'guests'
  | 'gifts'
  | 'gift_reservations';

const DEBOUNCE_MS = 300;
let channelCounter = 0;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly supabase = inject(SupabaseService);

  watch(
    eventId: string,
    tables: RealtimeTable[],
    onChange: () => void,
    destroyRef?: DestroyRef,
  ): () => void {
    let resolvedDestroyRef = destroyRef;
    if (!resolvedDestroyRef) {
      try {
        resolvedDestroyRef = inject(DestroyRef, { optional: true }) ?? undefined;
      } catch {
        resolvedDestroyRef = undefined;
      }
    }

    channelCounter += 1;
    const channelName = `event-${eventId}-${channelCounter}-${Date.now()}`;
    const channel = this.supabase.client.channel(channelName);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanedUp = false;

    const scheduleChange = (): void => {
      if (cleanedUp) {
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        if (!cleanedUp) {
          onChange();
        }
      }, DEBOUNCE_MS);
    };

    for (const table of tables) {
      const filter = table === 'events' ? `id=eq.${eventId}` : `event_id=eq.${eventId}`;
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, scheduleChange);
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, scheduleChange);
      // Realtime no permite filtrar DELETE; el aviso solo trae la clave primaria y basta para volver a consultar.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, scheduleChange);
    }

    channel.subscribe();

    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void this.supabase.client.removeChannel(channel);
    };

    resolvedDestroyRef?.onDestroy(cleanup);

    return cleanup;
  }
}
