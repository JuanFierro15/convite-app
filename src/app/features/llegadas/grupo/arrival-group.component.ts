import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavParams,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  ArrivalGuestView,
  ArrivalInvitationView,
  ArrivalSessionService,
  formatInvitationCode,
  formatTime,
} from '../../../core';
import { StatusBadgeComponent } from '../../../shared';

@Component({
  selector: 'app-arrival-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './arrival-group.component.html',
  styleUrls: ['./arrival-group.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonCheckbox,
    IonFooter,
    IonSpinner,
    StatusBadgeComponent,
  ],
})
export class ArrivalGroupComponent implements OnInit {
  private readonly session = inject(ArrivalSessionService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly navParams = inject(NavParams, { optional: true });

  private readonly invitationIdSignal = signal<string>('');

  @Input({ required: true })
  set invitationId(value: string) {
    if (value) {
      this.invitationIdSignal.set(value);
      this.initializeSelectionIfPossible();
    }
  }

  get invitationId(): string {
    return this.invitationIdSignal();
  }

  readonly invitation = computed<ArrivalInvitationView | undefined>(() => {
    const id = this.invitationIdSignal();
    return this.session.invitations().find((inv) => inv.id === id);
  });

  readonly formattedCode = computed<string>(() => {
    const inv = this.invitation();
    return inv ? formatInvitationCode(inv.code) : '';
  });

  readonly selectedGuestIds = signal<string[]>([]);
  private selectionInitialized = false;

  readonly saving = signal<boolean>(false);

  readonly allArrived = computed<boolean>(() => {
    const inv = this.invitation();
    if (!inv || inv.guests.length === 0) {
      return false;
    }
    return inv.guests.every((guest) => guest.arrivedAt !== null);
  });

  readonly pendingSelectedCount = computed<number>(() => {
    const inv = this.invitation();
    if (!inv) {
      return 0;
    }
    const selected = new Set(this.selectedGuestIds());
    return inv.guests.filter((guest) => guest.arrivedAt === null && selected.has(guest.id)).length;
  });

  constructor() {
    addIcons({ closeOutline });

    const navId = this.navParams?.get('invitationId');
    if (navId) {
      this.invitationIdSignal.set(navId);
    }

    effect(() => {
      this.initializeSelectionIfPossible();
    });
  }

  ngOnInit(): void {
    this.initializeSelectionIfPossible();
  }

  isGuestSelected(id: string): boolean {
    return this.selectedGuestIds().includes(id);
  }

  formatGuestTime(arrivedAt: string | null): string {
    return arrivedAt ? formatTime(arrivedAt) : '';
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss();
  }

  async onToggleGuest(
    guest: ArrivalGuestView,
    event: CustomEvent<{ checked: boolean }>,
  ): Promise<void> {
    const isChecked = event.detail.checked;
    const isCurrentlySelected = this.selectedGuestIds().includes(guest.id);

    if (!isChecked) {
      if (isCurrentlySelected) {
        this.selectedGuestIds.update((ids) => ids.filter((id) => id !== guest.id));
      }
      return;
    }

    if (guest.rsvp === 'accepted') {
      if (!isCurrentlySelected) {
        this.selectedGuestIds.update((ids) => [...ids, guest.id]);
      }
      return;
    }

    const checkboxEl = event.target as HTMLIonCheckboxElement | null;
    const alert = await this.alertCtrl.create({
      message: 'No confirmó asistencia, ¿registrar de todas formas?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Registrar',
          role: 'confirm',
        },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();

    if (role === 'confirm') {
      if (!this.selectedGuestIds().includes(guest.id)) {
        this.selectedGuestIds.update((ids) => [...ids, guest.id]);
      }
    } else {
      if (checkboxEl) {
        checkboxEl.checked = false;
      }
      this.selectedGuestIds.update((ids) => ids.filter((id) => id !== guest.id));
    }
  }

  async onUndo(guest: ArrivalGuestView, event?: Event): Promise<void> {
    event?.stopPropagation();

    const alert = await this.alertCtrl.create({
      header: `¿Deshacer la llegada de ${guest.full_name}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Deshacer',
          role: 'confirm',
        },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();

    if (role === 'confirm') {
      try {
        await this.session.undo(guest.id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.showToast(message, 'danger');
      }
    }
  }

  async onRegister(): Promise<void> {
    const inv = this.invitation();
    if (!inv) {
      return;
    }

    const idsToRegister = inv.guests
      .filter((guest) => guest.arrivedAt === null && this.selectedGuestIds().includes(guest.id))
      .map((guest) => guest.id);

    if (idsToRegister.length === 0) {
      return;
    }

    this.saving.set(true);
    try {
      const added = await this.session.register(this.invitationIdSignal(), idsToRegister);

      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {
        // Ignorar en plataformas sin soporte háptico
      }

      const toastMessage =
        added === 1
          ? 'Llegada registrada: 1 persona'
          : `Llegada registrada: ${added} personas`;

      await this.showToast(toastMessage, 'success');
      await this.modalCtrl.dismiss(null, 'registered');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.showToast(message, 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  private initializeSelectionIfPossible(): void {
    const inv = this.invitation();
    if (inv && !this.selectionInitialized) {
      this.selectionInitialized = true;
      const acceptedPending = inv.guests
        .filter((guest) => guest.rsvp === 'accepted' && guest.arrivedAt === null)
        .map((guest) => guest.id);
      this.selectedGuestIds.set(acceptedPending);
    }
  }

  private async showToast(message: string, color: 'danger' | 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
