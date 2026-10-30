import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
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
  formatInvitationCode,
  formatLongDate,
  formatTime,
  guestErrorMessage,
  guestInvitationUrl,
  guestTexts,
  normalizeInvitationCode,
  qrImageDataUrl,
  toBogotaDateInput,
} from '../../../core';
import { EmptyStateComponent, IllustrationComponent } from '../../../shared';

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
  ],
})
export class GuestInvitationPage implements OnInit, ViewWillEnter {
  private readonly guestApi = inject(GuestApiService);
  private readonly themeService = inject(ThemeService);
  private readonly toastController = inject(ToastController);

  protected readonly tablesEnabled = TABLES_ENABLED;

  readonly code = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly invitation = signal<GuestInvitation | null>(null);
  readonly qrCodeDataUrl = signal<string | null>(null);
  readonly savingGuestId = signal<string | null>(null);
  readonly savingRsvp = signal<'accepted' | 'declined' | null>(null);
  readonly hasRespondedInVisit = signal(false);

  readonly canRetry = computed(
    () => this.error() !== null && this.errorCode() !== 'invalid_code',
  );

  private fetching = false;
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

  readonly showRsvpConfirmation = computed(() => {
    const inv = this.invitation();
    if (!inv) {
      return false;
    }
    return this.hasRespondedInVisit() || inv.guests.some((guest) => guest.rsvp !== 'pending');
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
    void this.loadInvitation();
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
      return;
    }
    this.fetching = true;
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
      const code = err instanceof GuestApiError ? err.code : 'load_failed';
      const message =
        err instanceof Error && err.message
          ? err.message
          : guestErrorMessage('load_failed');
      if (code === 'invalid_code' || !this.invitation()) {
        this.invitation.set(null);
        this.qrCodeDataUrl.set(null);
        this.errorCode.set(code);
        this.error.set(message);
      } else {
        await this.showErrorToast(message);
      }
    } finally {
      this.loading.set(false);
      this.fetching = false;
    }
  }

  openMap(mapUrl: string): void {
    window.open(mapUrl, '_blank');
  }

  async onSelectRsvp(
    guest: GuestInvitationPerson,
    value: 'accepted' | 'declined',
  ): Promise<void> {
    const inv = this.invitation();
    if (!inv || !inv.can_respond || this.savingGuestId() !== null) {
      return;
    }
    this.savingGuestId.set(guest.id);
    this.savingRsvp.set(value);
    try {
      const updated = await this.guestApi.setRsvp(this.code(), guest.id, value);
      this.themeService.apply(updated.event.theme_id);
      this.invitation.set(updated);
      await this.generateQr(updated.invitation.code);
      this.hasRespondedInVisit.set(true);
    } catch (err) {
      const apiErr =
        err instanceof GuestApiError
          ? err
          : new GuestApiError(
              'unknown_error',
              err instanceof Error && err.message ? err.message : undefined,
            );
      if (apiErr.code === 'deadline_passed') {
        this.invitation.update((current) =>
          current ? { ...current, can_respond: false } : null,
        );
      }
      await this.showErrorToast(apiErr.message);
    } finally {
      this.savingGuestId.set(null);
      this.savingRsvp.set(null);
    }
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
