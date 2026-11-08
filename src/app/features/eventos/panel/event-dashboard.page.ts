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
  IonList,
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
  BudgetRepository,
  EventContextService,
  EventsRepository,
  RealtimeService,
  RsvpCounts,
  RsvpLogEntry,
  RsvpLogRepository,
  TABLES_ENABLED,
  TaskRow,
  TasksRepository,
  ThemeService,
  budgetCardText,
  daysUntil,
  formatTime,
  tasksCardText,
  toBogotaDateInput,
} from '../../../core';
import { EmptyStateComponent, RsvpLogItemComponent } from '../../../shared';

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
    IonList,
    EmptyStateComponent,
    RsvpLogItemComponent,
  ],
})
export class EventDashboardPage implements ViewWillEnter, ViewWillLeave {
  private readonly eventContext = inject(EventContextService);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly arrivalSession = inject(ArrivalSessionService);
  private readonly rsvpLogRepo = inject(RsvpLogRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly themeService = inject(ThemeService);
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
  readonly budgetSummaryText = signal<string | null>(null);
  readonly tasks = signal<TaskRow[] | null>(null);
  readonly tasksSummaryText = computed<string | null>(() => {
    const list = this.tasks();
    if (list === null) {
      return null;
    }
    return tasksCardText(list, toBogotaDateInput(this.now()));
  });
  readonly recentRsvpEntries = signal<RsvpLogEntry[]>([]);
  readonly recentRsvpTotal = signal<number>(0);
  readonly recentRsvpLoading = signal<boolean>(true);
  readonly recentRsvpError = signal<boolean>(false);
  readonly now = signal<Date>(new Date());
  private nowTimer: ReturnType<typeof setInterval> | null = null;
  private readonly initialLoading = signal<boolean>(true);

  readonly loading = computed<boolean>(
    () => (this.initialLoading() || this.eventContext.loading()) && this.event() === null,
  );

  readonly countdownCoverUrl = computed(() =>
    this.themeService.asset(this.event()?.theme_id, 'countdown.webp'),
  );

  readonly countdownTitle = computed<string>(() => {
    const currentEvent = this.event();
    if (!currentEvent) {
      return '';
    }
    const remaining = daysUntil(currentEvent.starts_at, this.now());
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

    this.destroyRef.onDestroy(() => {
      this.stopNowTimer();
    });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    if (this.eventContext.event()?.id !== eventId) {
      this.eventContext.clear();
      this.budgetSummaryText.set(null);
      this.tasks.set(null);
      this.counts.set({ accepted: 0, pending: 0, declined: 0, total: 0 });
      this.arrivals.set({
        confirmed: 0,
        arrivedConfirmed: 0,
        arrivedUnconfirmed: 0,
        arrivedTotal: 0,
      });
      this.recentRsvpEntries.set([]);
      this.recentRsvpTotal.set(0);
      this.recentRsvpLoading.set(true);
      this.recentRsvpError.set(false);
    }
    this.startNowTimer();
    this.initialLoading.set(true);
    void this.loadDashboard(eventId, { isInitial: true, forceEvent: true });
    void this.arrivalSession.prefetch(eventId);

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['events', 'guests', 'tasks', 'rsvp_log'],
      () => {
        void this.loadDashboard(this.id(), { isInitial: false, forceEvent: true });
      },
      this.destroyRef,
    );
  }

  ionViewWillLeave(): void {
    this.stopRealtime?.();
    this.stopRealtime = null;
    this.stopNowTimer();
  }

  async goBackToEvents(): Promise<void> {
    await this.router.navigate(['/eventos']);
  }

  async retryLoad(): Promise<void> {
    this.initialLoading.set(true);
    await this.loadDashboard(this.id(), { isInitial: true, forceEvent: true });
  }

  async retryRecentRsvp(): Promise<void> {
    this.recentRsvpLoading.set(true);
    this.recentRsvpError.set(false);
    await this.loadRecentRsvp(this.id());
  }

  private startNowTimer(): void {
    this.stopNowTimer();
    this.now.set(new Date());
    this.nowTimer = setInterval(() => {
      this.now.set(new Date());
    }, 60_000);
  }

  private stopNowTimer(): void {
    if (this.nowTimer !== null) {
      clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
  }

  private async loadRecentRsvp(eventId: string): Promise<void> {
    try {
      const page = await this.rsvpLogRepo.list(eventId, { limit: 5, offset: 0 });
      this.recentRsvpEntries.set(page.items);
      this.recentRsvpTotal.set(page.total);
      this.recentRsvpError.set(false);
    } catch {
      this.recentRsvpError.set(true);
    } finally {
      this.recentRsvpLoading.set(false);
    }
  }

  private async loadDashboard(
    eventId: string,
    options: { isInitial?: boolean; forceEvent?: boolean } = {},
  ): Promise<void> {
    const isInitial = options.isInitial ?? false;
    const forceEvent = options.forceEvent ?? isInitial;
    void this.loadRecentRsvp(eventId);
    try {
      const [, attendanceResult] = await Promise.allSettled([
        this.eventContext.load(eventId, { force: forceEvent }),
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

      try {
        const tasks = await this.tasksRepo.list(eventId);
        this.tasks.set(tasks);
      } catch {
        this.tasks.set(null);
      }

      if (this.isOwner()) {
        try {
          const total = await this.budgetRepo.committedTotal(eventId);
          this.budgetSummaryText.set(
            budgetCardText(this.event()?.budget_cop ?? null, total),
          );
        } catch {
          this.budgetSummaryText.set(null);
        }
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
