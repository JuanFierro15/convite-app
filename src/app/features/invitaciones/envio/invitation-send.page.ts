import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
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
  IonSpinner,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, logoWhatsapp } from 'ionicons/icons';
import {
  EventContextService,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
  formatPhone,
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
  readonly sending = signal<boolean>(false);
  readonly undoing = signal<boolean>(false);
  readonly showPreview = signal<boolean>(false);

  readonly formatPhone = formatPhone;

  private stopRealtime: (() => void) | null = null;
  private watchedEventId: string | null = null;
  private hasLoadedOnce = false;

  readonly withPhone = computed<InvitationWithGuests[]>(() =>
    this.invitations().filter((inv) => inv.phone !== null && inv.phone !== ''),
  );

  readonly withoutPhoneCount = computed<number>(
    () => this.invitations().length - this.withPhone().length,
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
    addIcons({ logoWhatsapp, checkmarkCircle });
  }

  ionViewWillEnter(): void {
    void this.initializePage();
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
        );
        return;
      }

      const opened = await this.invitationActions.shareWhatsApp(invitation, event);
      if (opened) {
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
      }
    } finally {
      this.showPreview.set(false);
      this.sending.set(false);
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
      await this.invitationActions.showError(err);
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

    if (this.watchedEventId !== null && this.watchedEventId !== eventId) {
      this.hasLoadedOnce = false;
      this.invitations.set([]);
      this.error.set(null);
      this.skippedIds.set(new Set());
      this.lastOpened.set(null);
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
