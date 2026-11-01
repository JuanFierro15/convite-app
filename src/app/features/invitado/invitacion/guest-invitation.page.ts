import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alarmOutline,
  alertCircleOutline,
  calendarOutline,
  checkmarkOutline,
  closeOutline,
  giftOutline,
  locationOutline,
  mapOutline,
  qrCodeOutline,
  restaurantOutline,
  timeOutline,
} from 'ionicons/icons';
import {
  GuestApiError,
  GuestApiService,
  GuestInvitation,
  GuestInvitationPerson,
  TABLES_ENABLED,
  ThemeService,
  findTheme,
  formatInvitationCode,
  formatLongDate,
  formatTime,
  guestErrorMessage,
  guestInvitationUrl,
  guestLoadErrorCode,
  guestTexts,
  normalizeInvitationCode,
  qrImageDataUrl,
  toBogotaDateInput,
} from '../../../core';
import { EmptyStateComponent, IllustrationComponent } from '../../../shared';
import { GuestIntroComponent } from '../intro/guest-intro.component';
import {
  INTRO_ENVIRONMENT,
  shouldOfferIntro,
} from '../intro/intro-environment';

export interface ConfirmationState {
  kind: 'missing' | 'thanks' | 'closed';
  text: string;
}

@Component({
  selector: 'app-guest-invitation',
  templateUrl: 'guest-invitation.page.html',
  styleUrls: ['guest-invitation.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
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
    GuestIntroComponent,
  ],
})
export class GuestInvitationPage implements OnInit, ViewWillEnter {
  private readonly guestApi = inject(GuestApiService);
  private readonly themeService = inject(ThemeService);
  private readonly toastController = inject(ToastController);
  private readonly introEnv = inject(INTRO_ENVIRONMENT);
  private readonly injector = inject(Injector);

  readonly welcomeTitleRef = viewChild<ElementRef<HTMLElement>>('welcomeHeading');

  protected readonly tablesEnabled = TABLES_ENABLED;

  readonly code = input.required<string>();

  readonly introOffered = signal(false);
  readonly introExiting = signal(false);
  readonly introCode = computed(() => normalizeInvitationCode(this.code()));
  readonly introVisible = computed(() => {
    const inv = this.invitation();
    return (
      this.introOffered() &&
      !this.loading() &&
      inv !== null &&
      findTheme(inv.event.theme_id)?.introVideo === true
    );
  });
  readonly introPending = computed(
    () => this.introVisible() && !this.introExiting(),
  );

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly invitation = signal<GuestInvitation | null>(null);
  readonly qrCodeDataUrl = signal<string | null>(null);
  readonly savingGuestId = signal<string | null>(null);
  readonly savingRsvp = signal<'accepted' | 'declined' | null>(null);
  readonly rsvpErrors = signal<Record<string, string>>({});

  readonly defaultErrorMessage = guestErrorMessage('invalid_code');

  readonly emptyStateMessage = computed(
    () => this.error() ?? this.defaultErrorMessage,
  );

  readonly canRetry = computed(
    () => this.error() !== null && this.errorCode() !== 'invalid_code',
  );

  private fetching = false;
  private fetchPromise: Promise<void> | null = null;
  private lastLoadedCode: string | null = null;

  readonly heroCoverUrl = computed(() => {
    const inv = this.invitation();
    return this.themeService.asset(inv?.event.theme_id, 'hero-cover.webp');
  });

  readonly giftsCoverUrl = computed(() => {
    const inv = this.invitation();
    return this.themeService.asset(inv?.event.theme_id, 'gift-reserved.webp');
  });

  readonly texts = computed(() => {
    const inv = this.invitation();
    const kind = inv?.invitation.kind ?? 'group';
    const groupName = inv?.invitation.group_name ?? '';
    return guestTexts(kind, groupName);
  });

  readonly welcomeTitle = computed(() => this.texts().welcomeTitle);

  readonly formattedInvitationCode = computed(() => {
    const inv = this.invitation();
    const rawCode = inv?.invitation.code || normalizeInvitationCode(this.code());
    return formatInvitationCode(rawCode);
  });

  readonly formattedEventDate = computed(() => {
    const inv = this.invitation();
    if (!inv) {
      return '';
    }
    const longDate = formatLongDate(inv.event.starts_at);
    const eventYear = toBogotaDateInput(inv.event.starts_at).slice(0, 4);
    const currentYear = toBogotaDateInput(new Date()).slice(0, 4);
    const withoutCurrentYear =
      eventYear === currentYear
        ? longDate.replace(new RegExp(`\\s+de\\s+${eventYear}$`, 'i'), '')
        : longDate;
    return withoutCurrentYear.charAt(0).toUpperCase() + withoutCurrentYear.slice(1);
  });

  readonly formattedEventTime = computed(() => {
    const inv = this.invitation();
    if (!inv) {
      return '';
    }
    return formatTime(inv.event.starts_at);
  });

  readonly formattedDeadline = computed(() => {
    const inv = this.invitation();
    if (!inv) {
      return '';
    }
    return formatLongDate(inv.event.rsvp_deadline)
      .replace(/^[^,]+,\s*/, '')
      .replace(/\s+de\s+\d{4}$/i, '');
  });

  readonly confirmationState = computed<ConfirmationState | null>(() => {
    const inv = this.invitation();
    if (!inv) {
      return null;
    }
    const guests = inv.guests;
    const total = guests.length;
    const answeredCount = guests.filter((g) => g.rsvp !== 'pending').length;

    if (inv.can_respond) {
      if (answeredCount === 0) {
        return null;
      }
      if (answeredCount === total) {
        return {
          kind: 'thanks',
          text: this.texts().rsvpThanks(this.formattedDeadline()),
        };
      }
      if (inv.invitation.kind === 'group') {
        const pendingNames = guests
          .filter((g) => g.rsvp === 'pending')
          .map((g) => g.full_name);
        return {
          kind: 'missing',
          text: this.texts().rsvpMissing(pendingNames, this.formattedDeadline()),
        };
      }
      return null;
    } else {
      if (answeredCount > 0) {
        return {
          kind: 'closed',
          text: this.texts().rsvpThanksClosed,
        };
      }
      return null;
    }
  });

  constructor() {
    addIcons({
      'calendar-outline': calendarOutline,
      'time-outline': timeOutline,
      'location-outline': locationOutline,
      'map-outline': mapOutline,
      'alarm-outline': alarmOutline,
      'checkmark-outline': checkmarkOutline,
      'close-outline': closeOutline,
      'restaurant-outline': restaurantOutline,
      'gift-outline': giftOutline,
      'qr-code-outline': qrCodeOutline,
      'alert-circle-outline': alertCircleOutline,
    });

    effect(() => {
      const currentCode = this.code();
      if (this.lastLoadedCode !== null && this.lastLoadedCode !== currentCode) {
        this.lastLoadedCode = currentCode;
        void this.loadInvitation();
      }
    });
  }

  ngOnInit(): void {
    this.introOffered.set(
      shouldOfferIntro(this.introEnv, normalizeInvitationCode(this.code())),
    );
    void this.loadInvitation();
  }

  onIntroExitStarted(): void {
    this.introExiting.set(true);
  }

  onIntroFinished(): void {
    this.introOffered.set(false);
    afterNextRender(
      () => {
        this.welcomeTitleRef()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  ionViewWillEnter(): void {
    void this.loadInvitation();
  }

  async onRefresh(event: Event): Promise<void> {
    try {
      await this.loadInvitation(true);
    } finally {
      const refresher = event.target as HTMLIonRefresherElement | null;
      await refresher?.complete();
    }
  }

  retryLoad(): void {
    void this.loadInvitation(false);
  }

  async loadInvitation(isRefresh = false): Promise<void> {
    if (this.fetching) {
      return this.fetchPromise ?? undefined;
    }
    this.fetching = true;
    this.fetchPromise = this.executeLoadInvitation(isRefresh);
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
      this.fetching = false;
    }
  }

  private async executeLoadInvitation(isRefresh: boolean): Promise<void> {
    if (!isRefresh && !this.invitation()) {
      this.loading.set(true);
    }
    this.error.set(null);
    this.errorCode.set(null);

    try {
      this.lastLoadedCode = this.code();
      const data = await this.guestApi.getInvitation(this.code());
      if (!data) {
        this.invitation.set(null);
        this.qrCodeDataUrl.set(null);
        this.errorCode.set('invalid_code');
        this.error.set(guestErrorMessage('invalid_code'));
        return;
      }
      this.themeService.apply(data.event.theme_id);
      this.invitation.set(data);
      await this.generateQr(data.invitation.code);
    } catch (err) {
      const rawCode = err instanceof GuestApiError ? err.code : 'load_failed';
      const code = guestLoadErrorCode(rawCode);
      const inv = this.invitation();
      if (code === 'invalid_code' || !inv) {
        this.invitation.set(null);
        this.qrCodeDataUrl.set(null);
        this.errorCode.set(code);
        this.error.set(guestErrorMessage(code));
      } else {
        const message = guestErrorMessage(code, inv.invitation.kind);
        await this.showReloadErrorToast(message);
      }
    } finally {
      this.loading.set(false);
    }
  }

  openMap(mapUrl: string): void {
    window.open(mapUrl, '_blank');
  }

  rsvpBadgeClass(rsvp: string): string {
    if (rsvp === 'accepted') {
      return 'badge-soft-success';
    }
    if (rsvp === 'declined') {
      return 'badge-soft-medium';
    }
    return 'badge-soft-warning';
  }

  async onSelectRsvp(
    guest: GuestInvitationPerson,
    value: 'accepted' | 'declined',
  ): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.can_respond || this.savingGuestId() !== null) {
      return;
    }
    this.clearRsvpError(guest.id);
    this.savingGuestId.set(guest.id);
    this.savingRsvp.set(value);
    try {
      const updated = await this.guestApi.setRsvp(this.code(), guest.id, value);
      this.themeService.apply(updated.event.theme_id);
      this.invitation.set(updated);
      await this.generateQr(updated.invitation.code);
      this.clearRsvpError(guest.id);
    } catch (err) {
      const code = err instanceof GuestApiError ? err.code : 'unknown_error';
      if (code === 'deadline_passed') {
        this.invitation.update((current) =>
          current ? { ...current, can_respond: false } : null,
        );
      } else {
        const text = guestErrorMessage(code, inv.invitation.kind);
        this.rsvpErrors.update((current) => ({
          ...current,
          [guest.id]: text,
        }));
      }
    } finally {
      this.savingGuestId.set(null);
      this.savingRsvp.set(null);
    }
  }

  private clearRsvpError(guestId: string): void {
    this.rsvpErrors.update((current) => {
      if (!current[guestId]) {
        return current;
      }
      const next = { ...current };
      delete next[guestId];
      return next;
    });
  }

  private async generateQr(invitationCode?: string): Promise<void> {
    const rawCode = invitationCode || normalizeInvitationCode(this.code());
    if (!rawCode) {
      this.qrCodeDataUrl.set(null);
      return;
    }
    try {
      const url = guestInvitationUrl(rawCode);
      const dataUrl = await qrImageDataUrl(url);
      this.qrCodeDataUrl.set(dataUrl);
    } catch {
      this.qrCodeDataUrl.set(null);
    }
  }

  private async showReloadErrorToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 8000,
      color: 'danger',
      position: 'bottom',
      buttons: [
        {
          text: 'Reintentar',
          handler: () => {
            void this.loadInvitation(false);
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
}
