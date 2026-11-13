import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, trashOutline } from 'ionicons/icons';
import { AuthService, EventContextService } from '../../../core';
import { PhotoCacheService } from '../../../core/photos/photo-cache.service';
import {
  EventPhoto,
  canDeletePhoto,
  formatPhotoDate,
  uploaderLabel,
} from '../../../core/photos/photo.models';
import { PhotosRepository } from '../../../core/photos/photos.repository';

@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonTitle,
    IonContent,
    IonFooter,
    IonIcon,
    IonSpinner,
  ],
  templateUrl: './photo-viewer.component.html',
  styleUrls: ['./photo-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoViewerComponent implements OnInit, AfterViewInit, OnDestroy {
  static activeInstance: PhotoViewerComponent | null = null;

  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly auth = inject(AuthService);
  private readonly eventContext = inject(EventContextService);
  private readonly photoCache = inject(PhotoCacheService);
  private readonly photosRepo = inject(PhotosRepository);

  @Input() photos: EventPhoto[] = [];
  @Input() startIndex = 0;
  @Input() eventId = '';

  readonly photosList = signal<EventPhoto[]>([]);
  readonly currentIndex = signal<number>(0);
  readonly fullUrls = signal<Record<string, string>>({});
  readonly fullErrors = signal<Record<string, boolean>>({});

  readonly sliderRef = viewChild<ElementRef<HTMLDivElement>>('slider');
  readonly closeBtnRef = viewChild<ElementRef<HTMLIonButtonElement>>('closeBtn');

  private readonly inFlight = new Set<string>();
  private readonly deletedIds: string[] = [];
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private positioned = false;
  private resizeObserver: ResizeObserver | null = null;

  readonly currentPhoto = computed<EventPhoto | null>(() => {
    const list = this.photosList();
    const idx = this.currentIndex();
    return list[idx] ?? null;
  });

  readonly isOwner = this.eventContext.isOwner;

  readonly canDeleteCurrentPhoto = computed<boolean>(() => {
    const photo = this.currentPhoto();
    if (!photo) {
      return false;
    }
    const userId = this.auth.user()?.id ?? null;
    return canDeletePhoto(photo, userId, this.isOwner());
  });

  constructor() {
    addIcons({ close, trashOutline });

    afterNextRender(() => {
      this.focusCloseButton();
    });
  }

  ngOnInit(): void {
    PhotoViewerComponent.activeInstance = this;
    const initialList = this.photos ?? [];
    this.photosList.set(initialList);

    const safeIndex =
      this.startIndex >= 0 && this.startIndex < initialList.length ? this.startIndex : 0;
    this.currentIndex.set(safeIndex);

    this.preloadNearbyPhotos(safeIndex);
  }

  private alignSlider(): void {
    const el = this.sliderRef()?.nativeElement;
    if (!el || el.clientWidth === 0) {
      return;
    }
    el.scrollLeft = el.clientWidth * this.currentIndex();
    this.positioned = true;
  }

  ngAfterViewInit(): void {
    const el = this.sliderRef()?.nativeElement;
    if (!el) {
      return;
    }
    if (typeof ResizeObserver === 'undefined') {
      this.alignSlider();
      return;
    }
    // El modal todavía no se muestra aquí y el carrusel mide 0: se ubica cuando ya tiene ancho.
    this.resizeObserver = new ResizeObserver(() => this.alignSlider());
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (PhotoViewerComponent.activeInstance === this) {
      PhotoViewerComponent.activeInstance = null;
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      this.goToPrevious();
    } else if (event.key === 'ArrowRight') {
      this.goToNext();
    }
  }

  onScroll(): void {
    if (!this.positioned) {
      return;
    }
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    this.scrollTimeout = setTimeout(() => {
      const el = this.sliderRef()?.nativeElement;
      if (!el) {
        return;
      }
      const width = el.clientWidth || 1;
      const newIndex = Math.round(el.scrollLeft / width);
      if (
        newIndex >= 0 &&
        newIndex < this.photosList().length &&
        newIndex !== this.currentIndex()
      ) {
        this.currentIndex.set(newIndex);
        this.preloadNearbyPhotos(newIndex);
      }
    }, 50);
  }

  goToPrevious(): void {
    if (this.currentIndex() > 0) {
      this.goToPhoto(this.currentIndex() - 1);
    }
  }

  goToNext(): void {
    if (this.currentIndex() < this.photosList().length - 1) {
      this.goToPhoto(this.currentIndex() + 1);
    }
  }

  goToPhoto(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.photosList().length - 1));
    this.currentIndex.set(clamped);
    this.preloadNearbyPhotos(clamped);
    const el = this.sliderRef()?.nativeElement;
    if (el) {
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ left: el.clientWidth * clamped, behavior: 'smooth' });
      } else {
        el.scrollLeft = el.clientWidth * clamped;
      }
    }
  }

  retryPhoto(photo: EventPhoto): void {
    const path = photo.photoPath;
    this.fullErrors.update((m) => {
      const copy = { ...m };
      delete copy[path];
      return copy;
    });
    this.loadFullPhoto(path);
  }

  preloadNearbyPhotos(centerIndex: number): void {
    const list = this.photosList();
    const indices = [centerIndex - 1, centerIndex, centerIndex + 1];

    for (const idx of indices) {
      if (idx >= 0 && idx < list.length) {
        this.loadFullPhoto(list[idx].photoPath);
      }
    }
  }

  private loadFullPhoto(path: string): void {
    if (this.fullUrls()[path] || this.fullErrors()[path] || this.inFlight.has(path)) {
      return;
    }
    this.inFlight.add(path);
    this.photoCache
      .getUrl(path)
      .then((url) => {
        this.fullUrls.update((m) => ({ ...m, [path]: url }));
      })
      .catch(() => {
        this.fullErrors.update((m) => ({ ...m, [path]: true }));
      })
      .finally(() => {
        this.inFlight.delete(path);
      });
  }

  getThumbUrl(thumbPath: string): string | null {
    return this.photoCache.peek(thumbPath);
  }

  getUploaderLabel(photo: EventPhoto): string {
    const userId = this.auth.user()?.id ?? null;
    return uploaderLabel(photo, userId);
  }

  getFormattedDate(createdAt: string): string {
    return formatPhotoDate(createdAt);
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss({ deleted: this.deletedIds });
  }

  async confirmDelete(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '¿Borrar esta foto?',
      message: 'Se borra para todos los del evento.',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            void this.executeDelete();
          },
        },
      ],
    });
    await alert.present();
  }

  private async executeDelete(): Promise<void> {
    const photo = this.currentPhoto();
    if (!photo) {
      return;
    }

    try {
      await this.photosRepo.delete(photo);
      this.photoCache.forget([photo.photoPath, photo.thumbPath]);
      this.deletedIds.push(photo.id);

      const toast = await this.toastCtrl.create({
        message: 'Foto borrada',
        duration: 3000,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();

      const remaining = this.photosList().filter((p) => p.id !== photo.id);
      this.photosList.set(remaining);

      if (remaining.length === 0) {
        await this.close();
        return;
      }

      const nextIndex = Math.min(this.currentIndex(), remaining.length - 1);
      this.currentIndex.set(nextIndex);
      this.goToPhoto(nextIndex);
      this.preloadNearbyPhotos(nextIndex);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : 'No pudimos borrar la foto.';
      const toast = await this.toastCtrl.create({
        message: errorMsg,
        duration: 3000,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    }
  }

  syncPhotos(photos: EventPhoto[]): void {
    if (photos.length === 0) {
      void this.close();
      return;
    }

    const current = this.currentPhoto();
    this.photosList.set(photos);

    if (!current) {
      void this.close();
      return;
    }

    const stillExists = photos.some((p) => p.id === current.id);
    if (!stillExists) {
      const newIndex = Math.min(this.currentIndex(), photos.length - 1);
      this.currentIndex.set(newIndex);
      this.goToPhoto(newIndex);
    } else {
      const updatedIndex = photos.findIndex((p) => p.id === current.id);
      if (updatedIndex !== -1 && updatedIndex !== this.currentIndex()) {
        this.currentIndex.set(updatedIndex);
        this.goToPhoto(updatedIndex);
      }
    }
    this.preloadNearbyPhotos(this.currentIndex());
  }

  private focusCloseButton(): void {
    const btn = this.closeBtnRef()?.nativeElement;
    if (!btn) {
      return;
    }
    if (typeof (btn as unknown as { setFocus?: () => Promise<void> }).setFocus === 'function') {
      void (btn as unknown as { setFocus: () => Promise<void> }).setFocus();
    } else if (typeof btn.focus === 'function') {
      btn.focus();
    }
  }
}
