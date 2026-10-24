import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
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
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  SegmentCustomEvent,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  callOutline,
  createOutline,
  keyOutline,
  logoWhatsapp,
  qrCodeOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  AuthService,
  EventContextService,
  GuestRow,
  InvitationStatus,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
  Rsvp,
  formatInvitationCode,
  formatPhone,
  invitationStatus,
} from '../../../core';
import { EmptyStateComponent, StatusBadgeComponent } from '../../../shared';
import { InvitationFormComponent } from '../formulario/invitation-form.component';
import { InvitationActionsService } from '../invitation-actions.service';
import { InvitationQrComponent } from '../qr/invitation-qr.component';

const VALID_RSVPS: ReadonlySet<string> = new Set(['accepted', 'pending', 'declined']);

@Component({
  selector: 'app-invitation-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'invitation-detail.page.html',
  styleUrls: ['invitation-detail.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonCard,
    IonCardContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
})
export class InvitationDetailPage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly eventContext = inject(EventContextService);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly invitationActions = inject(InvitationActionsService);
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();
  readonly invitationId = input.required<string>();

  readonly invitation = signal<InvitationWithGuests | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly deleting = signal<boolean>(false);

  private stopRealtime: (() => void) | null = null;
  private watchedEventId: string | null = null;
  private loadedInvitationId: string | null = null;
  private hasLoadedOnce = false;

  readonly defaultBackHref = computed(() => `/eventos/${this.id()}/invitaciones`);

  readonly status = computed<InvitationStatus>(() => {
    const current = this.invitation();
    return current ? invitationStatus(current.guests) : 'pending';
  });

  readonly phoneLabel = computed<string>(() => {
    const phone = this.invitation()?.phone;
    const formatted = formatPhone(phone);
    return formatted || 'Sin teléfono';
  });

  readonly formattedCode = computed<string>(() => {
    const code = this.invitation()?.code ?? '';
    return formatInvitationCode(code);
  });

  constructor() {
    addIcons({
      createOutline,
      trashOutline,
      logoWhatsapp,
      qrCodeOutline,
      callOutline,
      keyOutline,
    });
  }

  ionViewWillEnter(): void {
    void this.initializePage();
  }

  async retryLoad(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    await Promise.all([
      this.eventContext.load(this.id(), { force: true }),
      this.reloadInvitation(),
    ]);
  }

  async backToList(): Promise<void> {
    await this.router.navigate(['/eventos', this.id(), 'invitaciones']);
  }

  async openEditModal(): Promise<void> {
    const current = this.invitation();
    if (!current) {
      return;
    }

    const modal = await this.modalController.create({
      component: InvitationFormComponent,
      componentProps: {
        eventId: this.id(),
        invitation: current,
      },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
    });

    await modal.present();
    const { data, role } = await modal.onDidDismiss<InvitationWithGuests>();
    if (role === 'saved') {
      if (data) {
        this.invitation.set(data);
      } else {
        await this.reloadInvitation();
      }
    }
  }

  async onDelete(): Promise<void> {
    const current = this.invitation();
    if (!current || this.deleting()) {
      return;
    }

    try {
      const deleted = await this.invitationActions.confirmDelete(current, () =>
        this.deleting.set(true),
      );
      if (deleted) {
        await this.backToList();
      }
    } finally {
      this.deleting.set(false);
    }
  }

  async onGuestRsvpChange(guest: GuestRow, event: SegmentCustomEvent): Promise<void> {
    const rawValue = event.detail.value;
    if (typeof rawValue !== 'string' || !VALID_RSVPS.has(rawValue)) {
      return;
    }

    const nextRsvp = rawValue as Rsvp;
    if (nextRsvp === guest.rsvp) {
      return;
    }

    const previousRsvp = guest.rsvp as Rsvp;
    this.updateLocalGuestRsvp(guest.id, nextRsvp);

    try {
      await this.invitationsRepository.setGuestRsvp(guest.id, nextRsvp);
    } catch (err) {
      this.updateLocalGuestRsvp(guest.id, previousRsvp);
      const target = event.target as HTMLIonSegmentElement | null;
      if (target) {
        target.value = previousRsvp;
      }
      await this.invitationActions.showError(err);
    }
  }

  async onShareWhatsApp(): Promise<void> {
    const current = this.invitation();
    if (!current) {
      return;
    }

    let currentEvent = this.eventContext.event();
    if (!currentEvent) {
      await this.eventContext.load(this.id(), { force: true });
      currentEvent = this.eventContext.event();
    }
    if (!currentEvent) {
      await this.invitationActions.showError(
        new Error(
          this.eventContext.error() ?? 'No pudimos cargar la información. Inténtalo de nuevo.',
        ),
      );
      return;
    }

    await this.invitationActions.shareWhatsApp(current, currentEvent);
  }

  async openQrModal(): Promise<void> {
    const current = this.invitation();
    if (!current) {
      return;
    }

    const eventName = this.eventContext.event()?.name ?? '';
    const modal = await this.modalController.create({
      component: InvitationQrComponent,
      componentProps: {
        invitation: current,
        eventName,
      },
    });

    await modal.present();
  }

  private updateLocalGuestRsvp(guestId: string, rsvp: Rsvp): void {
    const current = this.invitation();
    if (!current) {
      return;
    }

    this.invitation.set({
      ...current,
      guests: current.guests.map((item) =>
        item.id === guestId ? { ...item, rsvp } : item,
      ),
    });
  }

  private async initializePage(): Promise<void> {
    const eventId = this.id();
    const invId = this.invitationId();
    if (!eventId || !invId) {
      this.loading.set(false);
      return;
    }

    if (this.loadedInvitationId !== null && this.loadedInvitationId !== invId) {
      this.hasLoadedOnce = false;
      this.invitation.set(null);
      this.error.set(null);
    }

    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    this.ensureRealtime(eventId);

    await Promise.all([
      this.eventContext.load(eventId),
      this.reloadInvitation(),
    ]);

    if (!this.auth.session() && !this.eventContext.role() && !this.eventContext.error()) {
      await this.router.navigate(['/login']);
    }
  }

  private async reloadInvitation(): Promise<void> {
    const invId = this.invitationId();
    if (!invId) {
      this.loading.set(false);
      return;
    }

    try {
      const data = await this.invitationsRepository.get(invId);
      this.invitation.set(data);
      this.error.set(null);
      this.hasLoadedOnce = true;
      this.loadedInvitationId = invId;
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar la invitación. Inténtalo de nuevo.';
      if (!this.invitation()) {
        this.error.set(message);
      } else {
        await this.invitationActions.showError(err);
      }
    } finally {
      this.loading.set(false);
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
      ['invitations', 'guests'],
      () => {
        void this.reloadInvitation();
      },
      this.destroyRef,
    );
  }
}
