import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircle, logoWhatsapp } from 'ionicons/icons';
import {
  EventContextService,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
  formatPhone,
  latestBatchId,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';
import { InvitationActionsService } from '../invitation-actions.service';

@Component({
  selector: 'app-invitation-send',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitation-send.page.html',
  styleUrls: ['./invitation-send.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonProgressBar,
    IonIcon,
    IonButton,
    IonCard,
    IonCardContent,
    IonFooter,
    EmptyStateComponent,
  ],
})
export class InvitationSendPage implements ViewWillEnter {
  private readonly eventContext = inject(EventContextService);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly invitationActions = inject(InvitationActionsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly invitations = signal<InvitationWithGuests[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly skippedIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly lastOpened = signal<{ id: string; groupName: string } | null>(null);
  readonly markFailed = signal<{ id: string; groupName: string } | null>(null);
  readonly sending = signal<boolean>(false);
  readonly retryingMark = signal<boolean>(false);
  readonly undoing = signal<boolean>(false);
  readonly showPreview = signal<boolean>(false);

  readonly batches = this.eventContext.batches;
  readonly hasBatches = computed<boolean>(() => this.batches().length > 0);
  readonly selectedBatch = signal<string>(
    latestBatchId(this.eventContext.batches()) ?? 'all',
  );

  readonly formatPhone = formatPhone;

  private stopRealtime: (() => void) | null = null;
  private watchedEventId: string | null = null;
  private hasLoadedOnce = false;
  private batchFilterInitialized = false;

  readonly filteredInvitations = computed<InvitationWithGuests[]>(() => {
    const all = this.invitations();
    const currentBatches = this.batches();
    if (currentBatches.length === 0) {
      return all;
    }

    const selected = this.selectedBatch();
    if (selected === 'all') {
      return all;
    }

    const batchIds = new Set(currentBatches.map((batch) => batch.id));
    if (selected === 'first') {
      return all.filter((inv) => inv.batch_id === null || !batchIds.has(inv.batch_id));
    }

    if (!batchIds.has(selected)) {
      return all;
    }

    return all.filter((inv) => inv.batch_id === selected);
  });

  readonly withPhone = computed<InvitationWithGuests[]>(() =>
    this.filteredInvitations().filter((inv) => inv.phone !== null && inv.phone !== ''),
  );

  readonly withoutPhoneCount = computed<number>(
    () => this.filteredInvitations().length - this.withPhone().length,
  );

  readonly sentCount = computed<number>(
    () => this.withPhone().filter((inv) => inv.whatsapp_sent_at !== null).length,
  );

  readonly queue = computed<InvitationWithGuests[]>(() => {
    const unsent = this.withPhone().filter((inv) => inv.whatsapp_sent_at === null);
    const skipped = this.skippedIds();
    const unskipped = unsent.filter((inv) => !skipped.has(inv.id));
    const movedToEnd = unsent.filter((inv) => skipped.has(inv.id));
    return [...unskipped, ...movedToEnd];
  });

  readonly current = computed<InvitationWithGuests | null>(
    () => this.queue()[0] ?? null,
  );

  readonly progress = computed<number>(() => {
    const total = this.withPhone().length;
    return total > 0 ? this.sentCount() / total : 0;
  });

  readonly previewText = computed<string>(() => {
    const currentInv = this.current();
    const currentEvent = this.eventContext.event();
    if (currentInv && currentEvent) {
      return this.invitationActions.whatsAppMessage(currentInv, currentEvent);
    }
    return '';
  });

  readonly noPhoneLabel = computed<string>(() => {
    const count = this.withoutPhoneCount();
    if (count === 1) {
      return '1 invitación no tiene teléfono. Compártela desde su detalle.';
    }
    return `${count} invitaciones no tienen teléfono. Compártelas desde su detalle.`;
  });

  constructor() {
    addIcons({ logoWhatsapp, checkmarkCircle, alertCircleOutline });

    effect(() => {
      const currentBatches = this.batches();
      const selected = this.selectedBatch();
      if (currentBatches.length === 0) {
        if (selected !== 'all') {
          this.selectedBatch.set('all');
        }
        return;
      }
      if (
        selected !== 'all' &&
        selected !== 'first' &&
        !currentBatches.some((batch) => batch.id === selected)
      ) {
        this.selectedBatch.set('all');
      }
    });
  }

  ionViewWillEnter(): void {
    void this.initializePage();
  }

  onBatchChange(event: CustomEvent<{ value?: string }>): void {
    const value = event.detail?.value;
    if (typeof value !== 'string' || value === '') {
      return;
    }
    this.selectedBatch.set(value);
    this.batchFilterInitialized = true;
    this.showPreview.set(false);
  }

  async retryLoad(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    await Promise.all([
      this.eventContext.load(this.id(), { force: true }),
      this.loadInvitations(),
    ]);
    if (this.eventContext.error() && !this.error()) {
      this.error.set(this.eventContext.error());
    } else {
      this.applyInitialBatchSelection();
    }
  }

  async sendCurrent(): Promise<void> {
    if (this.sending()) {
      return;
    }
    const invitation = this.current();
    if (!invitation) {
      return;
    }

    this.sending.set(true);
    try {
      let event = this.eventContext.event();
      if (!event) {
        await this.eventContext.load(this.id(), { force: true });
        event = this.eventContext.event();
      }
      if (!event) {
        await this.invitationActions.showError(
          new Error(
            this.eventContext.error() ?? 'No pudimos cargar la información. Inténtalo de nuevo.',
          ),
          'invitation-send-footer',
        );
        return;
      }

      const result = await this.invitationActions.shareWhatsApp(invitation, event, {
        notifyMarkFailure: false,
        toastAnchor: 'invitation-send-footer',
      });
      if (result.opened && result.marked) {
        const now = new Date().toISOString();
        this.invitations.update((items) =>
          items.map((item) =>
            item.id === invitation.id ? { ...item, whatsapp_sent_at: now } : item,
          ),
        );
        if (this.skippedIds().has(invitation.id)) {
          const nextSkipped = new Set(this.skippedIds());
          nextSkipped.delete(invitation.id);
          this.skippedIds.set(nextSkipped);
        }
        this.lastOpened.set({ id: invitation.id, groupName: invitation.group_name });
        this.markFailed.set(null);
      } else if (result.opened && !result.marked) {
        this.lastOpened.set(null);
        this.markFailed.set({ id: invitation.id, groupName: invitation.group_name });
      }
    } finally {
      this.showPreview.set(false);
      this.sending.set(false);
    }
  }

  async retryMark(): Promise<void> {
    const failed = this.markFailed();
    if (!failed || this.retryingMark()) {
      return;
    }

    this.retryingMark.set(true);
    try {
      const ok = await this.invitationActions.markSent(failed.id);
      if (ok) {
        const now = new Date().toISOString();
        this.invitations.update((items) =>
          items.map((item) =>
            item.id === failed.id ? { ...item, whatsapp_sent_at: now } : item,
          ),
        );
        if (this.skippedIds().has(failed.id)) {
          const nextSkipped = new Set(this.skippedIds());
          nextSkipped.delete(failed.id);
          this.skippedIds.set(nextSkipped);
        }
        this.lastOpened.set({ id: failed.id, groupName: failed.groupName });
        this.markFailed.set(null);
      }
    } finally {
      this.retryingMark.set(false);
    }
  }

  async undoLast(): Promise<void> {
    const last = this.lastOpened();
    if (!last || this.undoing()) {
      return;
    }

    this.undoing.set(true);
    try {
      await this.invitationsRepository.clearWhatsAppSent(last.id);
      this.invitations.update((items) =>
        items.map((item) =>
          item.id === last.id ? { ...item, whatsapp_sent_at: null } : item,
        ),
      );
      this.lastOpened.set(null);
    } catch (err) {
      await this.invitationActions.showError(err, 'invitation-send-footer');
    } finally {
      this.undoing.set(false);
    }
  }

  skipCurrent(): void {
    const current = this.current();
    if (!current) {
      return;
    }
    const nextSkipped = new Set(this.skippedIds());
    nextSkipped.add(current.id);
    this.skippedIds.set(nextSkipped);
    this.markFailed.set(null);
    this.showPreview.set(false);
  }

  togglePreview(): void {
    this.showPreview.update((value) => !value);
  }

  private async initializePage(): Promise<void> {
    const eventId = this.id();
    if (!eventId) {
      this.loading.set(false);
      return;
    }

    this.batchFilterInitialized = false;

    if (this.watchedEventId !== null && this.watchedEventId !== eventId) {
      this.hasLoadedOnce = false;
      this.invitations.set([]);
      this.error.set(null);
      this.skippedIds.set(new Set());
      this.selectedBatch.set('all');
      this.lastOpened.set(null);
      this.markFailed.set(null);
    }

    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    this.ensureRealtime(eventId);

    await Promise.all([
      this.eventContext.load(eventId),
      this.loadInvitations(),
    ]);

    if (this.eventContext.error() && !this.error()) {
      this.error.set(this.eventContext.error());
    } else {
      this.applyInitialBatchSelection();
    }
  }

  private applyInitialBatchSelection(): void {
    if (!this.eventContext.error() && !this.batchFilterInitialized) {
      this.selectedBatch.set(latestBatchId(this.batches()) ?? 'all');
      this.batchFilterInitialized = true;
    }
  }

  private async loadInvitations(): Promise<void> {
    const eventId = this.id();
    if (!eventId) {
      this.loading.set(false);
      return;
    }

    try {
      const items = await this.invitationsRepository.list(eventId);
      this.invitations.set(items);
      this.error.set(null);
      this.hasLoadedOnce = true;
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar las invitaciones. Inténtalo de nuevo.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  private async reloadFromRealtime(): Promise<void> {
    const eventId = this.id();
    if (!eventId) {
      return;
    }

    try {
      const items = await this.invitationsRepository.list(eventId);
      this.invitations.set(items);
    } catch {
      // Ignoramos error en segundo plano
    }
  }

  private ensureRealtime(eventId: string): void {
    if (this.watchedEventId === eventId && this.stopRealtime) {
      return;
    }
    this.stopRealtime?.();
    this.watchedEventId = eventId;
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['invitations'],
      () => {
        void this.reloadFromRealtime();
      },
      this.destroyRef,
    );
  }
}
