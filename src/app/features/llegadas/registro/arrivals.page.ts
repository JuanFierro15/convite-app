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
  QrScannerService,
  RealtimeService,
  ThemeService,
  extractInvitationCode,
  formatInvitationCode,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';
import { ArrivalGroupComponent } from '../grupo/arrival-group.component';

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

  private readonly isViewing = signal<boolean>(false);
  private stopRealtime: (() => void) | null = null;

  readonly headerTitle = computed<string>(() => {
    const name = this.session.snapshot()?.event?.name;
    return name ? `Llegadas · ${name}` : 'Llegadas';
  });

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

  readonly searchResults = computed<ArrivalInvitationView[]>(() => {
    const query = this.searchQuery();
    return this.session.search(query);
  });

  constructor() {
    addIcons({ qrCodeOutline });

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
    void this.session.open(this.id());
  }

  ionViewWillLeave(): void {
    this.isViewing.set(false);
    this.stopRealtime?.();
    this.stopRealtime = null;
  }

  onSearchInput(event: SearchbarCustomEvent): void {
    this.searchQuery.set(event.detail.value ?? '');
  }

  formatCode(code: string): string {
    return formatInvitationCode(code);
  }

  formatArrivedSummary(arrivedCount: number, totalCount: number): string {
    if (arrivedCount === 1 && totalCount === 1) {
      return '1 de 1 llegó';
    }
    return `${arrivedCount} de ${totalCount} llegaron`;
  }

  async openGroup(invitationId: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ArrivalGroupComponent,
      componentProps: { invitationId },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
    });
    await modal.present();
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

    await this.openGroup(invitation.id);
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
