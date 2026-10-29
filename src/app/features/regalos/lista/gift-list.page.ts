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
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  addOutline,
  closeCircleOutline,
  createOutline,
  ellipsisVerticalOutline,
  lockClosed,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  EventContextService,
  GiftKind,
  GiftReservationSummary,
  GiftWithReservations,
  GiftsRepository,
  RealtimeService,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';
import { GiftFormComponent } from '../formulario/gift-form.component';

export type GiftFilter = 'all' | GiftKind;

@Component({
  selector: 'app-gift-list',
  standalone: true,
  templateUrl: 'gift-list.page.html',
  styleUrls: ['gift-list.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonFab,
    IonFabButton,
    IonSpinner,
    EmptyStateComponent,
  ],
})
export class GiftListPage implements ViewWillEnter {
  private readonly eventContext = inject(EventContextService);
  private readonly giftsRepo = inject(GiftsRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(ToastController);

  readonly id = input.required<string>();

  readonly gifts = signal<GiftWithReservations[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly addingSuggested = signal<boolean>(false);
  readonly deletingGiftId = signal<string | null>(null);
  readonly releasingReservationId = signal<string | null>(null);
  readonly filter = signal<GiftFilter>('all');

  private stopRealtime: (() => void) | null = null;
  private watchedEventId: string | null = null;
  private hasLoadedOnce = false;

  readonly repeatableGifts = computed<GiftWithReservations[]>(() =>
    this.gifts().filter((g) => g.kind === 'repeatable'),
  );

  readonly freeGifts = computed<GiftWithReservations[]>(() =>
    this.gifts().filter((g) => g.kind === 'free'),
  );

  readonly uniqueGifts = computed<GiftWithReservations[]>(() =>
    this.gifts().filter((g) => g.kind === 'unique'),
  );

  readonly uniqueCount = computed<number>(() => this.uniqueGifts().length);

  readonly reservedUniqueCount = computed<number>(
    () => this.uniqueGifts().filter((g) => g.reservations.length > 0).length,
  );

  readonly filteredHasItems = computed<boolean>(() => {
    const active = this.filter();
    if (active === 'all') {
      return this.gifts().length > 0;
    }
    if (active === 'repeatable') {
      return this.repeatableGifts().length > 0;
    }
    if (active === 'free') {
      return this.freeGifts().length > 0;
    }
    return this.uniqueGifts().length > 0;
  });

  readonly showRepeatableSection = computed<boolean>(() => {
    const active = this.filter();
    return (active === 'all' || active === 'repeatable') && this.repeatableGifts().length > 0;
  });

  readonly showFreeSection = computed<boolean>(() => {
    const active = this.filter();
    return (active === 'all' || active === 'free') && this.freeGifts().length > 0;
  });

  readonly showUniqueSection = computed<boolean>(() => {
    const active = this.filter();
    return (active === 'all' || active === 'unique') && this.uniqueGifts().length > 0;
  });

  constructor() {
    addIcons({
      add,
      addOutline,
      sparklesOutline,
      ellipsisVerticalOutline,
      closeCircleOutline,
      lockClosed,
      createOutline,
      trashOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.initializePage(false);
  }

  retryLoad(): void {
    void this.initializePage(true);
  }

  private async initializePage(forceContext: boolean): Promise<void> {
    const eventId = this.id();
    if (this.watchedEventId !== null && this.watchedEventId !== eventId) {
      this.hasLoadedOnce = false;
      this.gifts.set([]);
      this.error.set(null);
    }

    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      await this.eventContext.load(eventId, { force: forceContext });
      const contextError = this.eventContext.error();
      if (contextError) {
        if (!this.hasLoadedOnce) {
          this.error.set(contextError);
        } else {
          await this.showToast(contextError, 'danger');
        }
        return;
      }

      if (this.eventContext.role() !== 'owner') {
        await this.showToast('Solo los propietarios ven la lista de regalos.', 'danger');
        await this.router.navigate(['/eventos', eventId, 'panel'], { replaceUrl: true });
        return;
      }

      this.setupRealtime(eventId);
      await this.loadGifts(!this.hasLoadedOnce);
    } finally {
      this.loading.set(false);
    }
  }

  onFilterChange(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value;
    if (value === 'all' || value === 'unique' || value === 'repeatable' || value === 'free') {
      this.filter.set(value);
    }
  }

  familyCountLabel(count: number, max: number | null): string {
    if (max !== null && max !== undefined) {
      const noun = max === 1 ? 'familia' : 'familias';
      return `${count} de ${max} ${noun}`;
    }
    if (count === 0) {
      return 'Ninguna familia todavía';
    }
    if (count === 1) {
      return '1 familia';
    }
    return `${count} familias`;
  }

  async addSuggestedGifts(): Promise<void> {
    if (this.addingSuggested()) {
      return;
    }
    this.addingSuggested.set(true);
    try {
      const added = await this.giftsRepo.addSuggested(this.id());
      await this.loadGifts(false);
      if (added === 0) {
        await this.showToast('Las opciones sugeridas ya estaban en la lista.', 'medium');
      } else {
        await this.showToast(`Agregamos ${added} opciones.`, 'success');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No pudimos agregar las opciones sugeridas.';
      await this.showToast(message, 'danger');
    } finally {
      this.addingSuggested.set(false);
    }
  }

  async openForm(gift?: GiftWithReservations): Promise<void> {
    const hasFreeGift = this.gifts().some(
      (item) => item.kind === 'free' && item.id !== gift?.id,
    );

    const modal = await this.modalCtrl.create({
      component: GiftFormComponent,
      componentProps: {
        eventId: this.id(),
        gift: gift ?? null,
        hasFreeGift,
      },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
      expandToScroll: false,
    });

    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      await this.loadGifts(false);
    }
  }

  async openGiftOptions(gift: GiftWithReservations): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: gift.name,
      buttons: [
        {
          text: 'Editar',
          icon: 'create-outline',
          handler: () => {
            void this.openForm(gift);
          },
        },
        {
          text: 'Borrar',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => {
            void this.confirmDelete(gift);
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

  async confirmDelete(gift: GiftWithReservations): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Borrar regalo',
      message: `¿Borrar ${gift.name}? Si alguien lo apartó, también se borra su reserva.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            void this.deleteGift(gift.id);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmRelease(
    gift: GiftWithReservations,
    reservation: GiftReservationSummary,
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Liberar reserva',
      message: `¿Liberar ${gift.name}? Volverá a quedar disponible en la lista.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Liberar',
          role: 'destructive',
          handler: () => {
            void this.releaseReservation(reservation.id);
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteGift(giftId: string): Promise<void> {
    if (this.deletingGiftId() !== null) {
      return;
    }
    this.deletingGiftId.set(giftId);
    try {
      await this.giftsRepo.remove(giftId);
      await this.loadGifts(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No pudimos borrar el regalo.';
      await this.showToast(message, 'danger');
    } finally {
      this.deletingGiftId.set(null);
    }
  }

  private async releaseReservation(reservationId: string): Promise<void> {
    if (this.releasingReservationId() !== null) {
      return;
    }
    this.releasingReservationId.set(reservationId);
    try {
      await this.giftsRepo.releaseReservation(reservationId);
      await this.loadGifts(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No pudimos liberar la reserva.';
      await this.showToast(message, 'danger');
    } finally {
      this.releasingReservationId.set(null);
    }
  }

  private setupRealtime(eventId: string): void {
    if (this.watchedEventId === eventId && this.stopRealtime !== null) {
      return;
    }
    this.stopRealtime?.();
    this.watchedEventId = eventId;
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['gifts', 'gift_reservations'],
      () => {
        void this.loadGifts(false);
      },
      this.destroyRef,
    );
  }

  private async loadGifts(showSpinner: boolean): Promise<void> {
    if (showSpinner) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const list = await this.giftsRepo.list(this.id());
      this.gifts.set(list);
      this.error.set(null);
      this.hasLoadedOnce = true;
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar la lista de regalos.';
      if (!this.hasLoadedOnce) {
        this.error.set(message);
      } else {
        await this.showToast(message, 'danger');
      }
    } finally {
      if (showSpinner) {
        this.loading.set(false);
      }
    }
  }

  private async showToast(
    message: string,
    color: 'danger' | 'success' | 'medium',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
