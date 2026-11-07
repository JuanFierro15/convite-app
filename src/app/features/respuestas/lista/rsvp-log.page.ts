import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import {
  RealtimeService,
  RsvpLogEntry,
  RsvpLogRepository,
} from '../../../core';
import {
  EmptyStateComponent,
  PaginationComponent,
  RsvpLogItemComponent,
} from '../../../shared';

export const RSVP_LOG_PAGE_SIZE = 10;

@Component({
  selector: 'app-rsvp-log',
  standalone: true,
  templateUrl: './rsvp-log.page.html',
  styleUrls: ['./rsvp-log.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonList,
    IonSpinner,
    EmptyStateComponent,
    PaginationComponent,
    RsvpLogItemComponent,
  ],
})
export class RsvpLogPage implements ViewWillEnter, ViewWillLeave {
  private readonly rsvpLogRepo = inject(RsvpLogRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly entries = signal<RsvpLogEntry[]>([]);
  readonly total = signal<number>(0);
  readonly page = signal<number>(1);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly now = signal<Date>(new Date());

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / RSVP_LOG_PAGE_SIZE)),
  );

  readonly totalText = computed(() => {
    const count = this.total();
    return count === 1 ? '1 respuesta registrada' : `${count} respuestas registradas`;
  });

  readonly content = viewChild(IonContent);
  readonly listStart = viewChild<ElementRef<HTMLDivElement>>('listStart');

  private stopRealtime: (() => void) | null = null;
  private nowTimer: ReturnType<typeof setInterval> | null = null;
  private hasLoadedOnce = false;
  private loadedEventId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopNowTimer();
    });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    this.startNowTimer();

    // Al volver del detalle de una invitación se conserva la página en la que estaba.
    if (this.loadedEventId !== eventId) {
      this.loadedEventId = eventId;
      this.hasLoadedOnce = false;
      this.page.set(1);
      this.entries.set([]);
      this.total.set(0);
      this.error.set(null);
      this.loading.set(true);
    }

    void this.loadPage(this.page());

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['rsvp_log', 'guests', 'invitations'],
      () => {
        void this.reloadCurrentPage();
      },
      this.destroyRef,
    );
  }

  ionViewWillLeave(): void {
    this.stopRealtime?.();
    this.stopRealtime = null;
    this.stopNowTimer();
  }

  async retryLoad(): Promise<void> {
    this.hasLoadedOnce = false;
    this.loading.set(true);
    await this.loadPage(this.page());
  }

  goToPreviousPage(): void {
    const current = this.page();
    if (current > 1) {
      void this.loadPage(current - 1);
      this.scrollToListStart();
    }
  }

  goToNextPage(): void {
    const current = this.page();
    if (current < this.totalPages()) {
      void this.loadPage(current + 1);
      this.scrollToListStart();
    }
  }

  async reloadCurrentPage(): Promise<void> {
    await this.loadPage(this.page());
  }

  async loadPage(targetPage: number): Promise<void> {
    const eventId = this.id();
    if (!this.hasLoadedOnce) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      const pageResult = await this.rsvpLogRepo.list(eventId, {
        limit: RSVP_LOG_PAGE_SIZE,
        offset: (targetPage - 1) * RSVP_LOG_PAGE_SIZE,
      });

      this.total.set(pageResult.total);
      const computedTotalPages = Math.max(1, Math.ceil(pageResult.total / RSVP_LOG_PAGE_SIZE));

      if (targetPage > computedTotalPages) {
        this.page.set(computedTotalPages);
        await this.loadPage(computedTotalPages);
        return;
      }

      this.page.set(targetPage);
      this.entries.set(pageResult.items);
      this.hasLoadedOnce = true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos cargar las respuestas. Inténtalo de nuevo.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
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

  private scrollToListStart(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }
    requestAnimationFrame(async () => {
      try {
        const content = this.content();
        const anchor = this.listStart()?.nativeElement;
        if (!content || !anchor || typeof content.getScrollElement !== 'function') {
          return;
        }
        const scrollEl = await content.getScrollElement();
        if (
          !scrollEl ||
          typeof scrollEl.getBoundingClientRect !== 'function' ||
          typeof anchor.getBoundingClientRect !== 'function'
        ) {
          return;
        }
        const anchorRect = anchor.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const y = Math.max(0, anchorRect.top - scrollRect.top + (scrollEl.scrollTop ?? 0) - 16);
        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = prefersReducedMotion ? 0 : 300;
        if (typeof content.scrollToPoint === 'function') {
          await content.scrollToPoint(0, y, duration);
        }
      } catch {
        // En entornos sin soporte de scroll no hace nada.
      }
    });
  }
}
