import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonProgressBar,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonText,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, ellipsisVerticalOutline, logOutOutline } from 'ionicons/icons';
import { filter, firstValueFrom } from 'rxjs';
import {
  AuthService,
  EventRow,
  EventSummary,
  EventsRepository,
  ThemeService,
  daysUntil,
  formatShortDate,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';

@Component({
  selector: 'app-event-list',
  standalone: true,
  templateUrl: 'event-list.page.html',
  styleUrls: ['event-list.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonCard,
    IonCardContent,
    IonProgressBar,
    IonChip,
    IonLabel,
    IonText,
    IonSkeletonText,
    EmptyStateComponent,
  ],
})
export class EventListPage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(ToastController);
  private readonly authReady$ = toObservable(this.auth.ready);

  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal<boolean>(true);
  readonly hasLoadedOnce = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly skeletonItems = [1, 2, 3] as const;

  readonly greeting = computed<string>(() => {
    const name = this.auth.displayName().trim();
    return name ? `Hola, ${name}` : 'Hola';
  });

  readonly canCreateEvent = computed<boolean>(() => {
    const list = this.events();
    return list.length === 0 || list.some((item) => item.role === 'owner');
  });

  constructor() {
    addIcons({
      addOutline,
      ellipsisVerticalOutline,
      logOutOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.theme.apply(null);

    if (!this.auth.ready()) {
      await firstValueFrom(this.authReady$.pipe(filter((ready) => ready)));
    }

    if (!this.auth.session()) {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    await this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const list = await this.eventsRepo.listMine();
      this.events.set(list);
      this.hasLoadedOnce.set(true);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar tus eventos. Inténtalo de nuevo.';
      if (this.hasLoadedOnce() && this.events().length > 0) {
        await this.showErrorToast(message);
      } else {
        this.hasLoadedOnce.set(false);
        this.error.set(message);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.loadEvents();
    } finally {
      await event.target.complete();
    }
  }

  retryLoad(): void {
    void this.loadEvents();
  }

  goToCreateEvent(): void {
    void this.router.navigateByUrl('/eventos/nuevo');
  }

  openEvent(eventId: string): void {
    void this.router.navigateByUrl(`/eventos/${eventId}/panel`);
  }

  async openOptionsMenu(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      buttons: [
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          icon: 'log-out-outline',
          handler: () => {
            void this.signOut();
          },
        },
        {
          text: 'Cancelar',
          role: 'cancel',
        },
      ],
    });
    await sheet.present();
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } finally {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }

  coverSrc(themeId: string): string {
    return this.theme.asset(themeId, 'hero-cover.webp');
  }

  formatDateAndCity(event: EventRow): string {
    const datePart = formatShortDate(event.starts_at);
    const city = event.city?.trim();
    return city ? `${datePart} · ${city}` : datePart;
  }

  daysBadgeText(startsAt: string): string {
    const days = daysUntil(startsAt);
    if (days > 1) {
      return `Faltan ${days} días`;
    }
    if (days === 1) {
      return 'Falta 1 día';
    }
    if (days === 0) {
      return 'Es hoy';
    }
    return 'Ya pasó';
  }

  daysBadgeClass(startsAt: string): string {
    const days = daysUntil(startsAt);
    if (days >= 1) {
      return 'badge-soft-primary';
    }
    if (days === 0) {
      return 'badge-soft-success';
    }
    return 'badge-soft-medium';
  }

  progressValue(item: EventSummary): number {
    const { accepted, total } = item.counts;
    if (!total || total <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, accepted / total));
  }

  progressPercent(item: EventSummary): number {
    const { accepted, total } = item.counts;
    if (!total || total <= 0) {
      return 0;
    }
    return Math.round((accepted / total) * 100);
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
