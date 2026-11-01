import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  SearchbarCustomEvent,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { qrCodeOutline } from 'ionicons/icons';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  ArrivalInvitationView,
  ArrivalSessionService,
  InvitationKind,
  QrScannerService,
  RealtimeService,
  ThemeService,
  extractInvitationCode,
  formatInvitationCode,
  formatListAge,
  isListStale,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';
import { ArrivalGroupComponent } from '../grupo/arrival-group.component';

export type ArrivedSummaryTone = 'complete' | 'partial' | 'none';

export interface ArrivedSummary {
  text: string;
  tone: ArrivedSummaryTone;
}

@Component({
  selector: 'app-arrivals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './arrivals.page.html',
  styleUrls: ['./arrivals.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    EmptyStateComponent,
  ],
})
export class ArrivalsPage implements ViewWillEnter, ViewWillLeave {
  readonly session = inject(ArrivalSessionService);
  private readonly themeService = inject(ThemeService);
  private readonly realtime = inject(RealtimeService);
  private readonly qrScanner = inject(QrScannerService);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly searchbar = viewChild(IonSearchbar);
  readonly searchQuery = signal<string>('');

  readonly now = signal<Date>(new Date());
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  private readonly isViewing = signal<boolean>(false);
  private stopRealtime: (() => void) | null = null;

  readonly unconfirmedText = computed<string | null>(() => {
    const count = this.session.counts().arrivedUnconfirmed;
    if (count === 1) {
      return '1 llegó sin confirmar';
    }
    if (count > 1) {
      return `${count} llegaron sin confirmar`;
    }
    return null;
  });

  readonly listAgeText = computed<string | null>(() => {
    const downloadedAt = this.session.downloadedAt();
    if (!downloadedAt) {
      return null;
    }
    return formatListAge(downloadedAt, this.now());
  });

  readonly listStale = computed<boolean>(() => {
    const downloadedAt = this.session.downloadedAt();
    if (!downloadedAt) {
      return false;
    }
    return isListStale(downloadedAt, this.now());
  });

  // Los mensajes de error ya traen punto final; el texto de la franja agrega el suyo.
  readonly syncErrorText = computed<string | null>(() => {
    const message = this.session.syncError()?.trim();
    return message ? message.replace(/[.\s]+$/, '') : null;
  });

  readonly queueLineText = computed<string>(() => {
    const count = this.session.pendingCount();
    if (count === 1) {
      return '1 llegada guardada en este celular, por sincronizar';
    }
    return `${count} llegadas guardadas en este celular, por sincronizar`;
  });

  readonly searchResults = computed<ArrivalInvitationView[]>(() => {
    const query = this.searchQuery();
    return this.session.search(query);
  });

  constructor() {
    addIcons({ qrCodeOutline });

    this.destroyRef.onDestroy(() => {
      this.stopClock();
    });

    effect(() => {
      const snap = this.session.snapshot();
      if (snap?.event?.theme_id) {
        this.themeService.apply(snap.event.theme_id);
      }
    });

    effect(() => {
      const viewing = this.isViewing();
      const online = this.session.online();
      const hasSession = this.session.hasSession();
      const eventId = this.id();

      if (viewing && online && hasSession && eventId) {
        if (!this.stopRealtime) {
          this.stopRealtime = this.realtime.watch(
            eventId,
            ['guests', 'invitations'],
            () => void this.session.refresh(),
            this.destroyRef,
          );
        }
      } else {
        if (this.stopRealtime) {
          this.stopRealtime();
          this.stopRealtime = null;
        }
      }
    });
  }

  ionViewWillEnter(): void {
    this.isViewing.set(true);
    this.startClock();
    void this.session.open(this.id());
  }

  ionViewWillLeave(): void {
    this.isViewing.set(false);
    this.stopClock();
    this.stopRealtime?.();
    this.stopRealtime = null;
  }

  onSearchInput(event: SearchbarCustomEvent): void {
    this.searchQuery.set(event.detail.value ?? '');
  }

  clearSearch(): void {
    this.searchQuery.set('');
    const searchbar = this.searchbar();
    if (searchbar) {
      searchbar.value = '';
    }
  }

  formatCode(code: string): string {
    return formatInvitationCode(code);
  }

  formatArrivedSummary(
    item: Pick<ArrivalInvitationView, 'arrivedCount' | 'totalCount'> & { kind?: InvitationKind },
  ): ArrivedSummary {
    const { arrivedCount, totalCount } = item;
    const kind = item.kind ?? 'group';
    const isIndividual = kind === 'individual';

    if (arrivedCount === totalCount && totalCount > 0) {
      return {
        text: isIndividual ? 'Ya llegó' : 'Ya llegaron todos',
        tone: 'complete',
      };
    }

    if (arrivedCount > 0 && arrivedCount < totalCount) {
      const verb = arrivedCount === 1 ? 'llegó' : 'llegaron';
      return {
        text: `${arrivedCount} de ${totalCount} ${verb}`,
        tone: 'partial',
      };
    }

    return {
      text: isIndividual ? 'No ha llegado' : `0 de ${totalCount} llegaron`,
      tone: 'none',
    };
  }

  async openGroup(invitationId: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ArrivalGroupComponent,
      componentProps: { invitationId },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      expandToScroll: false,
    });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'registered') {
      this.clearSearch();
    }
  }

  async onScanQr(): Promise<void> {
    if (!this.qrScanner.isAvailable()) {
      await this.handleCameraUnavailable();
      return;
    }

    const outcome = await this.qrScanner.scan();

    if (outcome.status === 'cancelled') {
      return;
    }

    if (outcome.status === 'unavailable') {
      await this.handleCameraUnavailable();
      return;
    }

    const code = extractInvitationCode(outcome.text);
    if (!code) {
      await this.vibrateWarning();
      await this.showToast('Este QR no es de una invitación de Convite.', 'danger', 3000);
      return;
    }

    const invitation = this.session.findByCode(code);
    if (!invitation) {
      await this.vibrateWarning();
      await this.showToast(
        'No encontramos esta invitación en la lista descargada. Si es nueva, actualiza la lista con conexión o búscala por nombre.',
        'danger',
        5000,
      );
      return;
    }

    void this.openGroup(invitation.id);
  }

  private startClock(): void {
    this.now.set(new Date());
    if (this.clockTimer === null) {
      this.clockTimer = setInterval(() => {
        this.now.set(new Date());
      }, 60_000);
    }
  }

  private stopClock(): void {
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private async handleCameraUnavailable(): Promise<void> {
    await this.vibrateWarning();
    await this.showToast(
      'No pudimos usar la cámara. Busca la invitación por nombre o código.',
      'danger',
      4000,
    );
    await this.searchbar()?.setFocus();
  }

  private async vibrateWarning(): Promise<void> {
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {
      // Ignorar en plataformas sin soporte háptico
    }
  }

  private async showToast(message: string, color: 'danger' | 'success', duration = 3000): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
