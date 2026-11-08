import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
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
  add,
  archiveOutline,
  chevronDownOutline,
  chevronUpOutline,
  createOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  EventContextService,
  TeamProfileRow,
  TeamProfilesRepository,
  newId,
  toUserError,
} from '../../core';
import { EmptyStateComponent } from '../../shared';

@Component({
  selector: 'app-profiles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profiles.page.html',
  styleUrls: ['./profiles.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonSpinner,
    EmptyStateComponent,
  ],
})
export class ProfilesPage implements ViewWillEnter {
  private readonly eventContext = inject(EventContextService);
  private readonly profilesRepo = inject(TeamProfilesRepository);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly id = input.required<string>();

  readonly teamId = signal<string | null>(null);
  readonly profiles = signal<TeamProfileRow[]>([]);
  readonly canManage = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<boolean>(false);
  private readonly pendingProfileIds = new Map<string, string>();

  readonly activeProfiles = computed<TeamProfileRow[]>(() =>
    this.profiles().filter((p) => p.archived_at === null),
  );

  readonly archivedProfiles = computed<TeamProfileRow[]>(() =>
    this.profiles().filter((p) => p.archived_at !== null),
  );

  constructor() {
    addIcons({
      add,
      archiveOutline,
      createOutline,
      refreshOutline,
      trashOutline,
      'chevron-up-outline': chevronUpOutline,
      'chevron-down-outline': chevronDownOutline,
      'create-outline': createOutline,
      'archive-outline': archiveOutline,
      'refresh-outline': refreshOutline,
      'trash-outline': trashOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    const eventId = this.id();
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.eventContext.load(eventId);
      if (this.eventContext.role() !== 'owner') {
        await this.router.navigate(['/eventos', eventId, 'panel'], { replaceUrl: true });
        return;
      }

      const teamId = this.eventContext.event()?.team_id ?? null;
      this.teamId.set(teamId);
      if (!teamId) {
        this.loading.set(false);
        return;
      }

      await this.loadProfiles(true);
    } catch (err) {
      const message = toUserError(err, 'No pudimos cargar los perfiles.').message;
      this.error.set(message);
      this.loading.set(false);
    }
  }

  retryLoad(): void {
    void this.ionViewWillEnter();
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    try {
      await this.loadProfiles(false);
    } finally {
      (event.target as HTMLIonRefresherElement)?.complete();
    }
  }

  async loadProfiles(showSpinner = false): Promise<void> {
    const currentTeamId = this.teamId();
    if (!currentTeamId) {
      return;
    }

    if (showSpinner) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      const [list, canManage] = await Promise.all([
        this.profilesRepo.list(currentTeamId),
        this.profilesRepo.canManage(this.id()),
      ]);
      this.profiles.set(list);
      this.canManage.set(canManage);
      this.error.set(null);
    } catch (err) {
      const message = toUserError(err, 'No pudimos cargar los perfiles.').message;
      if (showSpinner) {
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

  async openCreateProfileModal(): Promise<void> {
    const creationId = newId();
    const alert = await this.alertCtrl.create({
      header: 'Agregar perfil',
      cssClass: 'convite-alert',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nombre del perfil',
          attributes: {
            maxlength: 40,
          },
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Guardar',
          cssClass: 'convite-alert__confirm',
          handler: (data: { name?: string }) => {
            const trimmed = data?.name?.trim();
            if (!trimmed) {
              void this.showToast('Escribe un nombre.', 'danger');
              return false;
            }
            void this.createProfile(trimmed, creationId);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  async openRenameProfileModal(profile: TeamProfileRow): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Renombrar perfil',
      cssClass: 'convite-alert',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: profile.name,
          placeholder: 'Nombre del perfil',
          attributes: {
            maxlength: 40,
          },
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Guardar',
          cssClass: 'convite-alert__confirm',
          handler: (data: { name?: string }) => {
            const trimmed = data?.name?.trim();
            if (!trimmed) {
              void this.showToast('Escribe un nombre.', 'danger');
              return false;
            }
            void this.renameProfile(profile.id, trimmed);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  async archiveProfile(profile: TeamProfileRow): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.profilesRepo.setArchived(profile.id, true);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos archivar el perfil.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async unarchiveProfile(profile: TeamProfileRow): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.profilesRepo.setArchived(profile.id, false);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos desarchivar el perfil.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDeleteProfile(profile: TeamProfileRow): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Borrar perfil',
      message: `¿Borrar a ${profile.name}?`,
      cssClass: 'convite-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          cssClass: 'convite-alert__confirm',
          handler: () => {
            void this.deleteProfile(profile.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async moveProfileUp(index: number): Promise<void> {
    const actives = this.activeProfiles();
    if (index <= 0 || index >= actives.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.profilesRepo.swapOrder(actives[index], actives[index - 1]);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos cambiar el orden.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async moveProfileDown(index: number): Promise<void> {
    const actives = this.activeProfiles();
    if (index < 0 || index >= actives.length - 1 || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.profilesRepo.swapOrder(actives[index], actives[index + 1]);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos cambiar el orden.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private getPendingProfileId(name: string, fallbackId?: string): string {
    const key = name.trim().toLowerCase();
    let id = this.pendingProfileIds.get(key);
    if (!id) {
      id = fallbackId ?? newId();
      this.pendingProfileIds.set(key, id);
    }
    return id;
  }

  private async createProfile(name: string, requestedId?: string): Promise<void> {
    const currentTeamId = this.teamId();
    if (!currentTeamId) {
      return;
    }
    this.busy.set(true);
    const id = this.getPendingProfileId(name, requestedId);
    try {
      const maxOrder = this.profiles().reduce(
        (max, p) => Math.max(max, p.sort_order),
        -1,
      );
      await this.profilesRepo.create(id, currentTeamId, name, maxOrder + 1);
      this.pendingProfileIds.delete(name.trim().toLowerCase());
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos crear el perfil.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async renameProfile(id: string, name: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.profilesRepo.rename(id, name);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos renombrar el perfil.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async deleteProfile(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.profilesRepo.remove(id);
      await this.loadProfiles(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos borrar el perfil.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
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
