import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  checkmarkCircle,
  lockClosedOutline,
} from 'ionicons/icons';
import {
  GuestApiError,
  GuestApiService,
  GuestGift,
  GuestInvitation,
  ThemeService,
  guestErrorMessage,
} from '../../../core';
import { EmptyStateComponent, IllustrationComponent } from '../../../shared';

@Component({
  selector: 'app-guest-gifts',
  templateUrl: 'guest-gifts.page.html',
  styleUrls: ['guest-gifts.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    EmptyStateComponent,
    IllustrationComponent,
  ],
})
export class GuestGiftsPage implements OnInit, ViewWillEnter {
  private readonly guestApi = inject(GuestApiService);
  private readonly themeService = inject(ThemeService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly code = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly invitation = signal<GuestInvitation | null>(null);
  readonly gifts = signal<GuestGift[]>([]);
  readonly processingGiftId = signal<string | null>(null);
  readonly showReservedConfirmation = signal(false);

  private fetching = false;

  readonly eventName = computed(() => this.invitation()?.event.name ?? 'Lista de regalos');

  readonly unlimitedGifts = computed(() =>
    this.gifts().filter((gift) => gift.kind === 'repeatable' || gift.kind === 'free'),
  );

  readonly availableUniqueGifts = computed(() =>
    this.gifts().filter(
      (gift) => gift.kind === 'unique' && !gift.taken && !gift.reserved_by_me,
    ),
  );

  readonly myUniqueGifts = computed(() =>
    this.gifts().filter((gift) => gift.kind === 'unique' && gift.reserved_by_me),
  );

  readonly takenUniqueGifts = computed(() =>
    this.gifts().filter(
      (gift) => gift.kind === 'unique' && gift.taken && !gift.reserved_by_me,
    ),
  );

  constructor() {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'checkmark-circle': checkmarkCircle,
      'lock-closed-outline': lockClosedOutline,
    });
  }

  ngOnInit(): void {
    void this.loadData();
  }

  ionViewWillEnter(): void {
    void this.loadData();
  }

  async onRefresh(event: Event): Promise<void> {
    await this.loadData(true);
    const refresher = event.target as HTMLIonRefresherElement | null;
    await refresher?.complete();
  }

  async loadData(isRefresh = false): Promise<void> {
    if (this.fetching) {
      return;
    }
    this.fetching = true;
    if (!isRefresh && !this.invitation()) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      const [inv, giftList] = await Promise.all([
        this.guestApi.getInvitation(this.code()),
        this.guestApi.getGifts(this.code()),
      ]);

      if (!inv) {
        this.invitation.set(null);
        this.gifts.set([]);
        this.error.set(guestErrorMessage('invalid_code'));
        return;
      }

      this.themeService.apply(inv.event.theme_id);
      this.invitation.set(inv);
      this.gifts.set(giftList);
    } catch (err) {
      const apiErr =
        err instanceof GuestApiError ? err : new GuestApiError('unknown_error');
      if (apiErr.code === 'invalid_code' || !this.invitation()) {
        this.invitation.set(null);
        this.gifts.set([]);
        this.error.set(apiErr.message);
      } else {
        await this.showErrorToast(apiErr.message);
      }
    } finally {
      this.loading.set(false);
      this.fetching = false;
    }
  }

  async onToggleUnlimitedGift(gift: GuestGift): Promise<void> {
    if (gift.reserved_by_me) {
      await this.executeRelease(gift.id);
    } else {
      await this.executeReserve(gift.id);
    }
  }

  async onConfirmReserveUnique(gift: GuestGift): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirmar regalo',
      message: `¿Desean apartar ${gift.name} a nombre de ${inv.invitation.group_name}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Sí, apartar regalo',
          role: 'confirm',
          handler: () => {
            void this.executeReserve(gift.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async onConfirmReleaseUnique(gift: GuestGift): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Liberar regalo',
      message: `¿Liberar ${gift.name}? Otra familia podrá apartarlo.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Liberar',
          role: 'confirm',
          handler: () => {
            void this.executeRelease(gift.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async executeReserve(giftId: string): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }
    this.processingGiftId.set(giftId);
    try {
      const updated = await this.guestApi.reserveGift(this.code(), giftId);
      this.gifts.set(updated);
      this.showReservedConfirmation.set(true);
    } catch (err) {
      await this.handleActionError(err);
    } finally {
      this.processingGiftId.set(null);
    }
  }

  async executeRelease(giftId: string): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }
    this.processingGiftId.set(giftId);
    try {
      const updated = await this.guestApi.releaseGift(this.code(), giftId);
      this.gifts.set(updated);
    } catch (err) {
      await this.handleActionError(err);
    } finally {
      this.processingGiftId.set(null);
    }
  }

  private async handleActionError(err: unknown): Promise<void> {
    const apiErr =
      err instanceof GuestApiError ? err : new GuestApiError('unknown_error');
    await this.showErrorToast(apiErr.message);

    if (apiErr.code === 'already_reserved') {
      try {
        const refreshed = await this.guestApi.getGifts(this.code());
        this.gifts.set(refreshed);
      } catch {
        // Si falla la recarga secundaria, se mantiene el estado actual.
      }
    } else if (apiErr.code === 'gifts_closed') {
      this.invitation.update((current) =>
        current ? { ...current, gifts_open: false } : null,
      );
    }
  }

  private async showErrorToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 4000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}
