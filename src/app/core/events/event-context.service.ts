import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { LOAD_ERROR_MESSAGE, toUserError } from '../data/errors';
import { EventRole, EventRow } from '../models/events';
import { InvitationBatchRow } from '../models/invitation-batches';
import { SupabaseService } from '../supabase/supabase.service';
import { ThemeService } from '../theme/theme.service';
import { sortBatches } from '../utils/invitation-batches';

@Injectable({ providedIn: 'root' })
export class EventContextService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  private readonly eventSignal = signal<EventRow | null>(null);
  private readonly roleSignal = signal<EventRole | null>(null);
  private readonly batchesSignal = signal<InvitationBatchRow[]>([]);
  private readonly loadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly event = this.eventSignal.asReadonly();
  readonly role = this.roleSignal.asReadonly();
  readonly batches = this.batchesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly isOwner = computed<boolean>(() => this.roleSignal() === 'owner');

  async load(eventId: string, options?: { force?: boolean }): Promise<void> {
    if (!options?.force && this.eventSignal()?.id === eventId && this.roleSignal() !== null) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const userId =
        this.auth.user()?.id ??
        (await this.supabase.client.auth.getSession()).data.session?.user.id ??
        null;

      if (!userId) {
        this.eventSignal.set(null);
        this.roleSignal.set(null);
        this.batchesSignal.set([]);
        return;
      }

      const [eventResult, memberResult, batchesResult] = await Promise.all([
        this.supabase.client.from('events').select('*').eq('id', eventId).maybeSingle(),
        this.supabase.client
          .from('event_members')
          .select('role')
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .maybeSingle(),
        this.supabase.client.from('invitation_batches').select('*').eq('event_id', eventId),
      ]);

      if (eventResult.error || memberResult.error || batchesResult.error) {
        const err = toUserError(
          eventResult.error ?? memberResult.error ?? batchesResult.error,
          LOAD_ERROR_MESSAGE,
        );
        this.eventSignal.set(null);
        this.roleSignal.set(null);
        this.batchesSignal.set([]);
        this.errorSignal.set(err.message);
        return;
      }

      const eventData = eventResult.data;
      const roleData =
        (memberResult.data?.role as EventRole | undefined) ??
        (eventData && eventData.created_by === userId ? 'owner' : null);

      if (!eventData || !roleData) {
        this.eventSignal.set(null);
        this.roleSignal.set(null);
        this.batchesSignal.set([]);
        return;
      }

      this.eventSignal.set(eventData);
      this.roleSignal.set(roleData);
      this.batchesSignal.set(sortBatches(batchesResult.data ?? []));
      this.theme.apply(eventData.theme_id);
    } catch (err) {
      this.eventSignal.set(null);
      this.roleSignal.set(null);
      this.batchesSignal.set([]);
      this.errorSignal.set(toUserError(err, LOAD_ERROR_MESSAGE).message);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  setBatches(rows: readonly InvitationBatchRow[]): void {
    this.batchesSignal.set(sortBatches(rows));
  }

  clear(): void {
    this.eventSignal.set(null);
    this.roleSignal.set(null);
    this.batchesSignal.set([]);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
  }
}
