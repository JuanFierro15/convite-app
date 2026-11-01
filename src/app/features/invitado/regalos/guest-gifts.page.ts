import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
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
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
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
  chevronBackOutline,
  chevronForwardOutline,
  eyeOffOutline,
  heartOutline,
  lockClosedOutline,
  mailOutline,
} from 'ionicons/icons';
import {
  GUEST_GIFTS_PAGE_SIZE,
  GuestApiError,
  GuestApiService,
  GuestGift,
  GuestGiftCategory,
  GuestInvitation,
  ThemeService,
  envelopeGuestGift,
  guestErrorMessage,
  guestGiftAvailabilityLabel,
  guestGiftsLayout,
  guestLoadErrorCode,
  guestTexts,
  isGuestGiftSoldOut,
  myGuestGifts,
  orderGuestGiftIds,
  paginate,
  resolveGuestGiftFilter,
  selectableGuestGiftCounts,
  suggestionGuestGifts,
  visibleGuestGifts,
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
    IonSegment,
    IonSegmentButton,
    IonLabel,
    EmptyStateComponent,
    IllustrationComponent,
  ],
})
export class GuestGiftsPage implements OnInit, ViewWillEnter {
  private readonly guestApi = inject(GuestApiService);
  private readonly themeService = inject(ThemeService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly injector = inject(Injector);

  readonly code = input.required<string>();

  readonly content = viewChild(IonContent);
  readonly giftListStart = viewChild<ElementRef<HTMLElement>>('giftListStart');
  readonly basicsCard = viewChild<ElementRef<HTMLElement>>('basicsCard');
  readonly basicsTitle = viewChild<ElementRef<HTMLElement>>('basicsTitle');
  readonly envelopeCard = viewChild<ElementRef<HTMLElement>>('envelopeCard');
  readonly envelopeTitle = viewChild<ElementRef<HTMLElement>>('envelopeTitle');
  readonly reservedConfirmation =
    viewChild<unknown, ElementRef<HTMLElement>>('reservedConfirmation', {
      read: ElementRef,
    });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly defaultErrorMessage = guestErrorMessage('invalid_code');
  readonly invitation = signal<GuestInvitation | null>(null);
  readonly gifts = signal<GuestGift[]>([]);
  readonly processingGiftId = signal<string | null>(null);
  readonly showReservedConfirmation = signal(false);

  readonly preferredFilter = signal<GuestGiftCategory>('repeatable');
  readonly frozenIds = signal<string[]>([]);
  readonly page = signal(1);

  readonly canRetry = computed(
    () => this.error() !== null && this.errorCode() !== 'invalid_code',
  );

  private fetchPromise: Promise<void> | null = null;

  readonly eventName = computed(() => this.invitation()?.event.name ?? 'Lista de regalos');

  readonly texts = computed(() => {
    const inv = this.invitation();
    const kind = inv?.invitation.kind ?? 'group';
    const groupName = inv?.invitation.group_name ?? '';
    return guestTexts(kind, groupName);
  });

  readonly headerIntro = computed(() => {
    const inv = this.invitation();
    if (!inv) {
      return '';
    }
    if (!inv.gifts_open) {
      return this.texts().giftsPageIntroClosed;
    }
    if (this.layout().hasList && this.availableCount() === 0) {
      return this.layout().showShortcuts
        ? this.texts().giftsPageIntroSoldOut
        : this.texts().giftsPageIntroSoldOutNoExtras;
    }
    return this.layout().hasList
      ? this.texts().giftsPageIntro
      : this.texts().giftsPageIntroNoList;
  });

  readonly layout = computed(() => guestGiftsLayout(this.gifts()));

  readonly filterState = computed(() =>
    resolveGuestGiftFilter(this.gifts(), this.preferredFilter()),
  );

  readonly activeCategory = computed(() => this.filterState().active);
  readonly showFilter = computed(() => this.filterState().showFilter);
  readonly counts = computed(() => selectableGuestGiftCounts(this.gifts()));
  readonly availableCount = computed(
    () => this.counts().unique + this.counts().repeatable,
  );
  readonly availabilityLabel = computed(() =>
    guestGiftAvailabilityLabel(this.availableCount()),
  );
  readonly mine = computed(() => myGuestGifts(this.gifts()));
  readonly suggestions = computed(() => suggestionGuestGifts(this.gifts()));
  readonly envelope = computed(() => envelopeGuestGift(this.gifts()));
  readonly envelopeText = computed(() => {
    const d = this.envelope()?.description?.trim();
    return d ? d : null;
  });
  readonly visible = computed(() =>
    visibleGuestGifts(this.gifts(), this.activeCategory(), this.frozenIds()),
  );
  readonly paged = computed(() =>
    paginate(this.visible(), this.page(), GUEST_GIFTS_PAGE_SIZE),
  );

  constructor() {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'checkmark-circle': checkmarkCircle,
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'eye-off-outline': eyeOffOutline,
      'heart-outline': heartOutline,
      'lock-closed-outline': lockClosedOutline,
      'mail-outline': mailOutline,
    });
  }

  ngOnInit(): void {
    void this.loadData();
  }

  ionViewWillEnter(): void {
    void this.loadData();
  }

  async onRefresh(event: Event): Promise<void> {
    try {
      await this.loadData(true);
    } finally {
      const refresher = event.target as HTMLIonRefresherElement | null;
      await refresher?.complete();
    }
  }

  retryLoad(): void {
    void this.loadData(false);
  }

  async loadData(isRefresh = false): Promise<void> {
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    this.fetchPromise = this.executeLoadData(isRefresh).finally(() => {
      this.fetchPromise = null;
    });
    return this.fetchPromise;
  }

  private async executeLoadData(isRefresh = false): Promise<void> {
    if (!isRefresh && !this.invitation()) {
      this.loading.set(true);
    }
    this.error.set(null);
    this.errorCode.set(null);

    try {
      const [inv, giftList] = await Promise.all([
        this.guestApi.getInvitation(this.code()),
        this.guestApi.getGifts(this.code()),
      ]);

      if (!inv) {
        this.invitation.set(null);
        this.gifts.set([]);
        this.errorCode.set('invalid_code');
        this.error.set(guestErrorMessage('invalid_code'));
        return;
      }

      this.themeService.apply(inv.event.theme_id);
      this.invitation.set(inv);
      this.gifts.set(giftList);
      this.refreshOrder();
      this.page.set(this.paged().page);
    } catch (err) {
      const rawCode = err instanceof GuestApiError ? err.code : 'load_failed';
      const code = guestLoadErrorCode(rawCode);
      if (code === 'invalid_code' || !this.invitation()) {
        this.invitation.set(null);
        this.gifts.set([]);
        this.errorCode.set(code);
        this.error.set(guestErrorMessage(code));
      } else {
        const kind = this.invitation()?.invitation.kind;
        const toast = await this.toastController.create({
          message: guestErrorMessage(code, kind),
          duration: 8000,
          color: 'danger',
          position: 'bottom',
          buttons: [
            {
              text: 'Reintentar',
              handler: () => {
                void this.loadData(false);
              },
            },
            {
              text: 'Cerrar',
              role: 'cancel',
            },
          ],
        });
        await toast.present();
      }
    } finally {
      this.loading.set(false);
    }
  }

  onFilterChange(event: CustomEvent | Event): void {
    const value = (event as CustomEvent).detail?.value;
    if (value === 'unique' || value === 'repeatable') {
      this.preferredFilter.set(value);
      this.page.set(1);
      this.refreshOrder();
    }
  }

  goToPreviousPage(): void {
    const current = this.paged().page;
    if (current > 1) {
      this.refreshOrder();
      this.page.set(current - 1);
      this.scrollToElement(this.giftListStart()?.nativeElement);
    }
  }

  goToNextPage(): void {
    const { page, totalPages } = this.paged();
    if (page < totalPages) {
      this.refreshOrder();
      this.page.set(page + 1);
      this.scrollToElement(this.giftListStart()?.nativeElement);
    }
  }

  isSoldOut(gift: GuestGift): boolean {
    return isGuestGiftSoldOut(gift);
  }

  remainingLabel(gift: GuestGift): string | null {
    if (gift.kind !== 'repeatable' || gift.remaining === null || gift.max_reservations === null) {
      return null;
    }
    if (gift.remaining === 1) {
      return `Queda 1 de ${gift.max_reservations}`;
    }
    return `Quedan ${gift.remaining} de ${gift.max_reservations}`;
  }

  async onConfirmReserve(gift: GuestGift): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Elegir regalo',
      message: this.texts().reserveGiftConfirm(gift.name),
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Sí, elegirlo',
          role: 'confirm',
          handler: () => {
            void this.executeReserve(gift.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async onConfirmRelease(gift: GuestGift): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.gifts_open || this.processingGiftId() !== null) {
      return;
    }

    const alert = await this.alertController.create({
      header: this.texts().releaseGiftTitle,
      message: this.texts().releaseGiftConfirm(gift.name),
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: this.texts().releaseGiftConfirmButton,
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
      this.page.set(this.paged().page);
      this.showReservedConfirmation.set(true);
      afterNextRender(
        () => {
          const card = this.reservedConfirmation()?.nativeElement;
          if (card) {
            this.scrollToElement(card, card);
          }
        },
        { injector: this.injector },
      );
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
      this.page.set(this.paged().page);
      this.showReservedConfirmation.set(false);
    } catch (err) {
      await this.handleActionError(err);
    } finally {
      this.processingGiftId.set(null);
    }
  }

  private refreshOrder(): void {
    this.frozenIds.set(orderGuestGiftIds(this.gifts(), this.activeCategory()));
  }

  private scrollDuration(): number {
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return 0;
    }
    return 300;
  }

  private scrollToElement(
    target: HTMLElement | undefined,
    focusTarget?: HTMLElement,
  ): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }
    requestAnimationFrame(async () => {
      try {
        const content = this.content();
        if (!content || !target) {
          return;
        }
        if (typeof content.getScrollElement !== 'function') {
          return;
        }
        const scrollEl = await content.getScrollElement();
        if (
          !scrollEl ||
          typeof scrollEl.getBoundingClientRect !== 'function' ||
          typeof target.getBoundingClientRect !== 'function'
        ) {
          return;
        }
        const targetRect = target.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const y = Math.max(
          0,
          targetRect.top - scrollRect.top + (scrollEl.scrollTop ?? 0) - 16,
        );
        if (typeof content.scrollToPoint === 'function') {
          await content.scrollToPoint(0, y, this.scrollDuration());
        }
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus({ preventScroll: true });
        }
      } catch {
        // Ignora en entornos sin soporte completo de DOM o scroll (como jsdom)
      }
    });
  }

  scrollToBasics(): void {
    this.scrollToElement(
      this.basicsCard()?.nativeElement,
      this.basicsTitle()?.nativeElement,
    );
  }

  scrollToEnvelope(): void {
    this.scrollToElement(
      this.envelopeCard()?.nativeElement,
      this.envelopeTitle()?.nativeElement,
    );
  }

  private async handleActionError(err: unknown): Promise<void> {
    const code = err instanceof GuestApiError ? err.code : 'unknown_error';
    if (code === 'gifts_closed') {
      this.invitation.update((current) =>
        current ? { ...current, gifts_open: false } : null,
      );
    }
    await this.showNotice(code);

    try {
      const refreshed = await this.guestApi.getGifts(this.code());
      this.gifts.set(refreshed);
      this.page.set(this.paged().page);
    } catch {
      // Si falla la recarga secundaria, se mantiene el estado actual.
    }
  }

  private async showNotice(code: string): Promise<void> {
    const isInfo =
      code === 'already_reserved' ||
      code === 'gift_full' ||
      code === 'gift_not_reservable' ||
      code === 'gifts_closed' ||
      code === 'not_reserved_by_you';

    const toast = await this.toastController.create({
      message: guestErrorMessage(code, this.invitation()?.invitation.kind),
      duration: 8000,
      position: 'bottom',
      ...(isInfo ? { cssClass: 'convite-toast-info' } : { color: 'danger' }),
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
