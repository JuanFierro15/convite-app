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
  restaurantOutline,
  timeOutline,
} from 'ionicons/icons';
import {
  GuestApiError,
  GuestApiService,
  GuestInvitation,
  GuestInvitationPerson,
  ThemeService,
  formatLongDate,
  formatTime,
  guestErrorMessage,
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

  readonly code = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly invitation = signal<GuestInvitation | null>(null);
  readonly savingGuestId = signal<string | null>(null);
  readonly savingRsvp = signal<'accepted' | 'declined' | null>(null);
  readonly hasRespondedInVisit = signal(false);

  readonly canRetry = computed(
    () => this.error() !== null && this.errorCode() !== 'invalid_code',
  );

  private fetching = false;

  readonly heroCoverUrl = computed(() => {
    const inv = this.invitation();
    return this.themeService.asset(inv?.event.theme_id, 'hero-cover.webp');
  });

  readonly welcomeTitle = computed(() => {
    const groupName = this.invitation()?.invitation.group_name.trim() ?? '';
    if (!groupName) {
      return '';
    }
    if (/^familia\s+/i.test(groupName)) {
      const rest = groupName.replace(/^familia\s+/i, '').trim();
      return `La familia ${rest} está invitada`;
    }
    return `${groupName}, están invitados`;
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
      const data = await this.guestApi.getInvitation(this.code());
      if (!data) {
        this.invitation.set(null);
        this.errorCode.set('invalid_code');
        this.error.set(guestErrorMessage('invalid_code'));
        return;
      }
      this.themeService.apply(data.event.theme_id);
      this.invitation.set(data);
    } catch (err) {
      const code = err instanceof GuestApiError ? err.code : 'load_failed';
      const message =
        err instanceof Error && err.message
          ? err.message
          : guestErrorMessage('load_failed');
      if (code === 'invalid_code' || !this.invitation()) {
        this.invitation.set(null);
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
