import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, shareSocialOutline } from 'ionicons/icons';
import QRCode from 'qrcode';
import {
  InvitationRow,
  InvitationsRepository,
  formatInvitationCode,
} from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';

@Component({
  selector: 'app-invitation-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitation-qr.component.html',
  styleUrls: ['./invitation-qr.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonCard,
    IonCardContent,
    IonIcon,
    IonSpinner,
  ],
})
export class InvitationQrComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly invitationActions = inject(InvitationActionsService);

  @Input({ required: true }) invitation!: Pick<InvitationRow, 'group_name' | 'code'>;
  @Input() eventName = '';

  readonly qrDataUrl = signal<string | null>(null);
  readonly loading = signal<boolean>(true);
  readonly sharing = signal<boolean>(false);
  readonly groupName = signal<string>('');
  readonly formattedCode = signal<string>('');
  readonly guestUrl = signal<string>('');

  constructor() {
    addIcons({ shareSocialOutline, closeOutline });
  }

  ngOnInit(): void {
    const inv = this.invitation;
    this.groupName.set(inv.group_name);
    this.formattedCode.set(formatInvitationCode(inv.code));
    const link = this.invitationsRepository.guestLink(inv.code);
    this.guestUrl.set(link);
    void this.generateQr(link);
  }

  async shareQr(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl || this.sharing()) {
      return;
    }

    this.sharing.set(true);
    const fileName = `convite-qr-${this.invitation.code}.png`;

    try {
      if (Capacitor.isNativePlatform()) {
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const { uri } = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });
        try {
          await Share.share({
            title: `Invitación de ${this.invitation.group_name}`,
            text: `Invitación a ${this.eventName}`,
            files: [uri],
          });
        } catch {
          // El usuario puede cerrar el menú de compartir sin elegir una app.
        }
        return;
      }

      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      await this.invitationActions.showError(err);
    } finally {
      this.sharing.set(false);
    }
  }

  async close(): Promise<void> {
    await this.modalController.dismiss();
  }

  private async generateQr(link: string): Promise<void> {
    this.loading.set(true);
    try {
      const styles = getComputedStyle(document.documentElement);
      const dark = styles.getPropertyValue('--ion-color-dark').trim();
      const light = styles.getPropertyValue('--ion-background-color').trim();

      const dataUrl = await QRCode.toDataURL(link, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: dark || undefined,
          light: light || undefined,
        },
      });
      this.qrDataUrl.set(dataUrl);
    } catch (err) {
      await this.invitationActions.showError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
