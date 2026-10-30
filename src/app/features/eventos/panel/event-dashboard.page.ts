import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRow,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alarmOutline,
  checkboxOutline,
  checkmarkCircle,
  closeCircle,
  createOutline,
  giftOutline,
  gridOutline,
  mailOutline,
  qrCodeOutline,
  time,
  walletOutline,
} from 'ionicons/icons';
import {
  ArrivalCounts,
  ArrivalSessionService,
  EventContextService,
  EventsRepository,
  RealtimeService,
  RsvpCounts,
  TABLES_ENABLED,
  daysUntil,
  formatTime,
} from '../../../core';
import { EmptyStateComponent, IllustrationComponent } from '../../../shared';

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Bogota',
});

function formatDayMonthBogota(iso: string): string {
  const trimmed = iso.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00-05:00`)
    : new Date(trimmed);
  return DAY_MONTH_FORMATTER.format(date).replace(/\s+/g, ' ');
}

@Component({
  selector: 'app-event-dashboard',
  templateUrl: 'event-dashboard.page.html',
  styleUrls: ['event-dashboard.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonGrid,
    IonRow,
    IonCol,
    IllustrationComponent,
    EmptyStateComponent,
  ],
})
export class EventDashboardPage implements ViewWillEnter, ViewWillLeave {
  private readonly eventContext = inject(EventContextService);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly arrivalSession = inject(ArrivalSessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly tablesEnabled = TABLES_ENABLED;

  readonly event = this.eventContext.event;
  readonly isOwner = this.eventContext.isOwner;
  readonly error = this.eventContext.error;
  readonly counts = signal<RsvpCounts>({
    accepted: 0,
    pending: 0,
    declined: 0,
    total: 0,
  });
  readonly arrivals = signal<ArrivalCounts>({
    confirmed: 0,
    arrivedConfirmed: 0,
    arrivedUnconfirmed: 0,
    arrivedTotal: 0,
  });
  private readonly initialLoading = signal<boolean>(true);

  readonly loading = computed<boolean>(
    () => (this.initialLoading() || this.eventContext.loading()) && this.event() === null,
  );

  readonly countdownTitle = computed<string>(() => {
    const currentEvent = this.event();
    if (!currentEvent) {
      return '';
    }
    const remaining = daysUntil(currentEvent.starts_at);
    if (remaining > 1) {
      return `Faltan ${remaining} días`;
    }
    if (remaining === 1) {
      return 'Falta 1 día';
    }
    if (remaining === 0) {
      return 'Es hoy';
    }
    return 'El evento ya pasó';
  });

  readonly eventDateText = computed<string>(() => {
    const currentEvent = this.event();
    return currentEvent ? formatDayMonthBogota(currentEvent.starts_at) : '';
  });

  readonly eventTimeText = computed<string>(() => {
    const currentEvent = this.event();
    return currentEvent ? formatTime(currentEvent.starts_at) : '';
  });

  readonly deadlineDateText = computed<string>(() => {
    const currentEvent = this.event();
    return currentEvent ? formatDayMonthBogota(currentEvent.rsvp_deadline) : '';
  });

  private stopRealtime: (() => void) | null = null;

  constructor() {
    addIcons({
      createOutline,
      alarmOutline,
      checkmarkCircle,
      time,
      closeCircle,
      mailOutline,
      giftOutline,
      gridOutline,
      walletOutline,
      checkboxOutline,
      qrCodeOutline,
    });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    if (this.eventContext.event()?.id !== eventId) {
      this.eventContext.clear();
      this.counts.set({ accepted: 0, pending: 0, declined: 0, total: 0 });
      this.arrivals.set({
        confirmed: 0,
        arrivedConfirmed: 0,
        arrivedUnconfirmed: 0,
        arrivedTotal: 0,
      });
    }
    this.initialLoading.set(true);
    void this.loadDashboard(eventId, true);
    void this.arrivalSession.prefetch(eventId);

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['events', 'guests'],
      () => {
        void this.loadDashboard(this.id(), false);
      },
      this.destroyRef,
    );
  }

  ionViewWillLeave(): void {
    this.stopRealtime?.();
    this.stopRealtime = null;
  }

  async goBackToEvents(): Promise<void> {
    await this.router.navigate(['/eventos']);
  }

  async retryLoad(): Promise<void> {
    this.initialLoading.set(true);
    await this.loadDashboard(this.id(), true);
  }

  private async loadDashboard(
    eventId: string,
    isInitial: boolean,
  ): Promise<void> {
    try {
      const [, attendanceResult] = await Promise.allSettled([
        this.eventContext.load(eventId, { force: isInitial }),
        this.eventsRepo.attendanceFor(eventId),
      ]);

      if (attendanceResult.status === 'fulfilled') {
        this.counts.set(attendanceResult.value.rsvp);
        this.arrivals.set(attendanceResult.value.arrivals);
      } else if (this.eventContext.event() !== null) {
        const reason: unknown = attendanceResult.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : 'No pudimos cargar el resumen del evento.';
        await this.showErrorToast(message);
      }
    } finally {
      if (isInitial) {
        this.initialLoading.set(false);
      }
    }
  }

  private async showErrorToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}
