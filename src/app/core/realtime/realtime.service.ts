import { DestroyRef, Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { SupabaseService } from '../supabase/supabase.service';

export type RealtimeTable =
  | 'events'
  | 'invitations'
  | 'guests'
  | 'gifts'
  | 'gift_reservations'
  | 'tasks'
  | 'rsvp_log';

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
    let hasSubscribedOnce = false;
    let isChannelDown = false;
    let resumeHandle: PluginListenerHandle | null = null;

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

    // Los cambios que ocurren con el canal caído o la app en segundo plano no se reenvían al reconectar.
    channel.subscribe((status) => {
      if (cleanedUp) {
        return;
      }
      if (status === 'SUBSCRIBED') {
        if (!hasSubscribedOnce) {
          hasSubscribedOnce = true;
        } else if (isChannelDown) {
          isChannelDown = false;
          scheduleChange();
        }
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        if (hasSubscribedOnce) {
          isChannelDown = true;
        }
      }
    });

    if (Capacitor.isNativePlatform()) {
      void App.addListener('resume', () => {
        scheduleChange();
      }).then((handle) => {
        if (cleanedUp) {
          void handle.remove().catch(() => {});
        } else {
          resumeHandle = handle;
        }
      }).catch(() => {
        // Ignorar si falla el listener nativo
      });
    }

    const handleVisibilityChange = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        scheduleChange();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (resumeHandle !== null) {
        void resumeHandle.remove().catch(() => {});
        resumeHandle = null;
      }
      void this.supabase.client.removeChannel(channel);
    };

    resolvedDestroyRef?.onDestroy(cleanup);

    return cleanup;
  }
}
