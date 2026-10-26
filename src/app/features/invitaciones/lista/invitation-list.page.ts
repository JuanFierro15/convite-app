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
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  SearchbarCustomEvent,
  SegmentCustomEvent,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, logoWhatsapp } from 'ionicons/icons';
import {
  AuthService,
  EventContextService,
  GuestRow,
  InvitationStatus,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
  invitationStatus,
  normalizeSearchText,
  rsvpCounts,
} from '../../../core';
import { EmptyStateComponent, StatusBadgeComponent } from '../../../shared';
import { InvitationFormComponent } from '../formulario/invitation-form.component';
import { InvitationActionsService } from '../invitation-actions.service';

export type InvitationFilter = 'all' | InvitationStatus;

export interface InvitationListItem {
  invitation: InvitationWithGuests;
  status: InvitationStatus;
  summary: string;
}

function formatInvitationSummary(guests: readonly GuestRow[]): string {
  const counts = rsvpCounts(guests);
  const totalPart = `${counts.total} ${counts.total === 1 ? 'persona' : 'personas'}`;

  const breakdownParts: string[] = [];
  if (counts.accepted > 0) {
    breakdownParts.push(
      `${counts.accepted} ${counts.accepted === 1 ? 'aceptó' : 'aceptaron'}`,
    );
  }
  if (counts.pending > 0) {
    breakdownParts.push(
      `${counts.pending} ${counts.pending === 1 ? 'pendiente' : 'pendientes'}`,
    );
  }
  if (counts.declined > 0) {
    breakdownParts.push(
      `${counts.declined} ${counts.declined === 1 ? 'no asiste' : 'no asisten'}`,
    );
  }

  if (breakdownParts.length === 0) {
    return totalPart;
  }

  return `${totalPart} · ${breakdownParts.join(', ')}`;
}

@Component({
  selector: 'app-invitation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'invitation-list.page.html',
  styleUrls: ['invitation-list.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonContent,
    IonCard,
    IonCardContent,
    IonChip,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    IonSpinner,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
})
export class InvitationListPage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly eventContext = inject(EventContextService);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly invitationActions = inject(InvitationActionsService);
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly invitations = signal<InvitationWithGuests[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<InvitationFilter>('all');

  private stopRealtime: (() => void) | null = null;
  private watchedEventId: string | null = null;
  private hasLoadedOnce = false;

  readonly defaultBackHref = computed(() => `/eventos/${this.id()}/panel`);

  private readonly mappedItems = computed<InvitationListItem[]>(() =>
    this.invitations().map((invitation) => ({
      invitation,
      status: invitationStatus(invitation.guests),
      summary: formatInvitationSummary(invitation.guests),
    })),
  );

  readonly searchedItems = computed<InvitationListItem[]>(() => {
    const query = normalizeSearchText(this.searchQuery()).trim();
    const items = this.mappedItems();
    if (!query) {
      return items;
    }

    return items.filter(({ invitation }) => {
      if (normalizeSearchText(invitation.group_name).includes(query)) {
        return true;
      }
      return invitation.guests.some((guest) =>
        normalizeSearchText(guest.full_name).includes(query),
      );
    });
  });

  readonly filterCounts = computed(() => {
    const items = this.searchedItems();
    let pending = 0;
    let partial = 0;
    let accepted = 0;
    let declined = 0;

    for (const item of items) {
      if (item.status === 'pending') {
        pending += 1;
      } else if (item.status === 'partial') {
        partial += 1;
      } else if (item.status === 'accepted') {
        accepted += 1;
      } else if (item.status === 'declined') {
        declined += 1;
      }
    }

    return {
      all: items.length,
      pending,
      partial,
      accepted,
      declined,
    };
  });

  readonly filteredItems = computed<InvitationListItem[]>(() => {
    const filter = this.selectedFilter();
    const items = this.searchedItems();
    if (filter === 'all') {
      return items;
    }
    return items.filter((item) => item.status === filter);
  });

  readonly totalsLabel = computed<string>(() => {
    const items = this.filteredItems();
    const invitationCount = items.length;
    const guestCount = items.reduce(
      (sum, item) => sum + item.invitation.guests.length,
      0,
    );
    const invWord = invitationCount === 1 ? 'invitación' : 'invitaciones';
    const guestWord = guestCount === 1 ? 'persona' : 'personas';
    return `${invitationCount} ${invWord} · ${guestCount} ${guestWord}`;
  });

  constructor() {
    addIcons({ add, logoWhatsapp });
  }

  ionViewWillEnter(): void {
    void this.initializePage();
  }

  async retryLoad(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    await Promise.all([
      this.eventContext.load(this.id(), { force: true }),
      this.reloadInvitations(),
    ]);
  }

  onSearchInput(event: SearchbarCustomEvent): void {
    this.searchQuery.set(event.detail.value ?? '');
  }

  onFilterChange(event: SegmentCustomEvent): void {
    const value = event.detail.value as InvitationFilter | undefined;
    if (value) {
      this.selectedFilter.set(value);
    }
  }

  async openDetail(invitationId: string): Promise<void> {
    await this.router.navigate(['/eventos', this.id(), 'invitaciones', invitationId]);
  }

  async onShareWhatsApp(
    event: Event,
    invitation: InvitationWithGuests,
  ): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

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

    await this.invitationActions.shareWhatsApp(invitation, currentEvent);
  }

  async openCreateModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: InvitationFormComponent,
      componentProps: {
        eventId: this.id(),
      },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
      expandToScroll: false,
    });

    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'saved') {
      await this.reloadInvitations();
    }
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
    }

    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    this.ensureRealtime(eventId);

    await Promise.all([
      this.eventContext.load(eventId),
      this.reloadInvitations(),
    ]);

    if (!this.auth.session() && !this.eventContext.role() && !this.eventContext.error()) {
      await this.router.navigate(['/login']);
    }
  }

  private async reloadInvitations(): Promise<void> {
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
      if (!this.hasLoadedOnce) {
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
        void this.reloadInvitations();
      },
      this.destroyRef,
    );
  }
}
