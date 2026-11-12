import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ActionSheetController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonFab,
  IonFabButton,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonModal,
  IonProgressBar,
  IonRefresher,
  IonRefresherContent,
  IonRow,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, close, imageOutline } from 'ionicons/icons';
import {
  AuthService,
  EventContextService,
  NetworkStatusService,
  RealtimeService,
  toUserError,
} from '../../core';
import { CameraPermissionService } from '../../core/photos/camera-permission.service';
import { PhotoCacheService } from '../../core/photos/photo-cache.service';
import {
  PhotoCaptureOutcome,
  PhotoCaptureService,
} from '../../core/photos/photo-capture.service';
import { PhotoUploadService } from '../../core/photos/photo-upload.service';
import {
  EventPhoto,
  GALLERY_PICK_LIMIT,
  PHOTO_LIMIT,
  PhotoUpload,
  uploaderLabel,
} from '../../core/photos/photo.models';
import { PhotosRepository } from '../../core/photos/photos.repository';
import {
  CameraPermissionNoticeComponent,
  EmptyStateComponent,
} from '../../shared';
import { PhotoViewerComponent } from './visor/photo-viewer.component';

export const GALLERY_PAGE_CHUNK_SIZE = 24;

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonGrid,
    IonRow,
    IonCol,
    IonButton,
    IonIcon,
    IonSkeletonText,
    IonProgressBar,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonFab,
    IonFabButton,
    IonModal,
    EmptyStateComponent,
    CameraPermissionNoticeComponent,
  ],
  templateUrl: './gallery.page.html',
  styleUrls: ['./gallery.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryPage implements ViewWillEnter, ViewWillLeave {
  private readonly eventContext = inject(EventContextService);
  private readonly photosRepo = inject(PhotosRepository);
  private readonly photoCache = inject(PhotoCacheService);
  private readonly photoUpload = inject(PhotoUploadService);
  private readonly photoCapture = inject(PhotoCaptureService);
  private readonly cameraPermission = inject(CameraPermissionService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly photoLimit = PHOTO_LIMIT;
  readonly skeletonItems = [1, 2, 3, 4, 5, 6];

  readonly isNative = this.cameraPermission.isNative();

  readonly photos = signal<EventPhoto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly visibleCount = signal<number>(GALLERY_PAGE_CHUNK_SIZE);

  readonly thumbUrls = signal<Record<string, string>>({});
  readonly thumbErrors = signal<Record<string, boolean>>({});
  private readonly fetchingThumbs = new Set<string>();

  readonly uploads = computed<PhotoUpload[]>(() => {
    return this.photoUpload.uploadsFor(this.id())();
  });

  readonly visiblePhotos = computed<EventPhoto[]>(() => {
    return this.photos().slice(0, this.visibleCount());
  });

  readonly permissionModalOpen = signal<boolean>(false);
  readonly permissionKind = signal<'denied' | 'permanently-denied'>('denied');

  private stopRealtime: (() => void) | null = null;
  private hasLoadedOnce = false;

  constructor() {
    addIcons({ add, close, imageOutline });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    void this.initialize(eventId);

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      eventId,
      ['event_photos'],
      () => {
        void this.loadPhotos(false);
      },
      this.destroyRef,
    );
  }

  ionViewWillLeave(): void {
    this.stopRealtime?.();
    this.stopRealtime = null;
  }

  async retryLoad(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    await this.initialize(this.id());
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    try {
      await this.loadPhotos(false);
    } finally {
      const target = event.target as HTMLIonRefresherElement | null;
      await target?.complete();
    }
  }

  private async initialize(eventId: string): Promise<void> {
    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      await this.eventContext.load(eventId, { force: !this.hasLoadedOnce });
      await this.loadPhotos(true);
    } catch (err: unknown) {
      if (!this.hasLoadedOnce) {
        this.error.set(toUserError(err, 'No pudimos cargar las fotos.').message);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async loadPhotos(isInitial = false): Promise<void> {
    if (isInitial && !this.hasLoadedOnce) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      const list = await this.photosRepo.list(this.id());
      this.photos.set(list);
      this.hasLoadedOnce = true;
      this.loadVisibleThumbs();
      PhotoViewerComponent.activeInstance?.syncPhotos(list);
    } catch (err: unknown) {
      if (!this.hasLoadedOnce) {
        this.error.set(toUserError(err, 'No pudimos cargar las fotos.').message);
      }
    } finally {
      this.loading.set(false);
    }
  }

  loadVisibleThumbs(): void {
    const visible = this.visiblePhotos();
    for (const photo of visible) {
      const path = photo.thumbPath;
      if (this.thumbUrls()[path] || this.thumbErrors()[path] || this.fetchingThumbs.has(path)) {
        continue;
      }
      this.fetchingThumbs.add(path);
      this.photoCache
        .getUrl(path)
        .then((url) => {
          this.thumbUrls.update((m) => ({ ...m, [path]: url }));
        })
        .catch(() => {
          this.thumbErrors.update((m) => ({ ...m, [path]: true }));
        })
        .finally(() => {
          this.fetchingThumbs.delete(path);
        });
    }
  }

  async loadMore(event: CustomEvent): Promise<void> {
    const next = this.visibleCount() + GALLERY_PAGE_CHUNK_SIZE;
    this.visibleCount.set(Math.min(next, this.photos().length));
    this.loadVisibleThumbs();

    const target = event.target as HTMLIonInfiniteScrollElement | null;
    await target?.complete();
    if (this.visibleCount() >= this.photos().length && target) {
      target.disabled = true;
    }
  }

  getPhotoAriaLabel(photo: EventPhoto, index: number): string {
    const total = this.photos().length;
    const userId = this.auth.user()?.id ?? null;
    const label = uploaderLabel(photo, userId);
    return `Foto ${index + 1} de ${total}, ${label}`;
  }

  async openViewer(index: number, event?: Event): Promise<void> {
    const triggerEl = (event?.currentTarget as HTMLElement) ?? null;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: {
        photos: this.photos(),
        startIndex: index,
        eventId: this.id(),
      },
      cssClass: 'photo-viewer-modal',
    });

    await modal.present();
    const { data } = await modal.onDidDismiss<{ deleted?: string[] }>();

    if (triggerEl && typeof triggerEl.focus === 'function') {
      triggerEl.focus();
    }

    if (data?.deleted && data.deleted.length > 0) {
      await this.loadPhotos(false);
    }
  }

  async handleAddPhotoClick(): Promise<void> {
    if (!this.networkStatus.online()) {
      await this.showToast('Sin conexión. Conéctate para subir fotos.', 'danger');
      return;
    }

    const inProgress = this.uploads().filter((u) => u.status !== 'failed').length;
    if (this.photos().length + inProgress >= PHOTO_LIMIT) {
      await this.showToast('La galería llegó al límite de 300 fotos.', 'danger');
      return;
    }

    await this.openAddPhotoSheet();
  }

  private async openAddPhotoSheet(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Agregar fotos',
      buttons: [
        {
          text: 'Tomar foto',
          handler: () => {
            void this.handleTakePhoto();
          },
        },
        {
          text: 'Elegir de la galería',
          handler: () => {
            void this.handleChooseFromGallery();
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

  async handleTakePhoto(): Promise<void> {
    const outcome = await this.photoCapture.takePhoto();
    await this.processCaptureOutcome(outcome);
  }

  async handleChooseFromGallery(): Promise<void> {
    const available = PHOTO_LIMIT - this.photos().length;
    const max = Math.min(GALLERY_PICK_LIMIT, Math.max(available, 1));
    const outcome = await this.photoCapture.chooseFromGallery(max);
    await this.processCaptureOutcome(outcome);
  }

  private async processCaptureOutcome(outcome: PhotoCaptureOutcome): Promise<void> {
    if (outcome.status === 'captured') {
      const result = await this.photoUpload.enqueue(this.id(), outcome.photos);
      await this.loadPhotos(false);

      if (result.uploaded > 0) {
        const msg =
          result.uploaded === 1 ? 'Foto subida' : `${result.uploaded} fotos subidas`;
        await this.showToast(msg, 'success');
      }

      if (result.failed > 0) {
        const msg =
          result.failed === 1
            ? 'No se pudo subir la foto'
            : `No se pudieron subir ${result.failed} fotos`;
        await this.showToast(msg, 'danger');
      }
    } else if (outcome.status === 'cancelled') {
      // No hacer nada
    } else if (
      outcome.status === 'permission-denied' ||
      outcome.status === 'permission-permanently-denied'
    ) {
      this.permissionKind.set(
        outcome.status === 'permission-permanently-denied'
          ? 'permanently-denied'
          : 'denied',
      );
      this.permissionModalOpen.set(true);
    } else if (outcome.status === 'unavailable') {
      await this.showToast('No pudimos abrir la cámara.', 'danger');
    }
  }

  onPermissionRetry(): void {
    this.permissionModalOpen.set(false);
    void this.handleTakePhoto();
  }

  async onPermissionOpenSettings(): Promise<void> {
    const opened = await this.cameraPermission.openAppSettings();
    if (!opened) {
      await this.showToast(
        'No pudimos abrir los ajustes. Ábrelos desde el celular.',
        'danger',
      );
    }
  }

  onPermissionChooseGallery(): void {
    this.permissionModalOpen.set(false);
    void this.handleChooseFromGallery();
  }

  async retryUpload(id: string): Promise<void> {
    const success = await this.photoUpload.retry(id);
    if (success) {
      await this.loadPhotos(false);
      await this.showToast('Foto subida', 'success');
    }
  }

  dismissUpload(id: string): void {
    this.photoUpload.dismiss(id);
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
