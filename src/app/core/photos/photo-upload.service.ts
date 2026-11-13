import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { newId } from '../utils/uuid';
import { PhotoCompressor, PhotoTooLargeError } from './photo-compressor';
import {
  CapturedPhoto,
  PhotoUpload,
  photoPaths,
} from './photo.models';
import { PHOTO_STORAGE_TRANSPORT } from './photo-storage.transport';
import { PhotoLimitReachedError, PhotosRepository } from './photos.repository';

interface InternalUploadState {
  id: string;
  eventId: string;
  webPath: string;
  previewUrl: string | null;
  compressed?: {
    photo: Blob;
    thumb: Blob;
    width: number;
    height: number;
  };
  thumbUploaded?: boolean;
  photoUploaded?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PhotoUploadService {
  private readonly compressor = inject(PhotoCompressor);
  private readonly transport = inject(PHOTO_STORAGE_TRANSPORT);
  private readonly repository = inject(PhotosRepository);

  private readonly uploadsSignal = signal<PhotoUpload[]>([]);
  readonly uploads: Signal<PhotoUpload[]> = this.uploadsSignal.asReadonly();

  private readonly internalMap = new Map<string, InternalUploadState>();
  private readonly eventUploadsMap = new Map<string, Signal<PhotoUpload[]>>();

  uploadsFor(eventId: string): Signal<PhotoUpload[]> {
    let existing = this.eventUploadsMap.get(eventId);
    if (!existing) {
      existing = computed(() => this.uploadsSignal().filter((u) => u.eventId === eventId));
      this.eventUploadsMap.set(eventId, existing);
    }
    return existing;
  }

  async enqueue(
    eventId: string,
    photos: CapturedPhoto[],
  ): Promise<{ uploaded: number; failed: number }> {
    let uploaded = 0;
    let failed = 0;

    for (const photo of photos) {
      const id = newId();
      const internal: InternalUploadState = {
        id,
        eventId,
        webPath: photo.webPath,
        previewUrl: null,
      };
      this.internalMap.set(id, internal);

      const initialUpload: PhotoUpload = {
        id,
        eventId,
        previewUrl: null,
        status: 'compressing',
        progress: 0.1,
        error: null,
        retryable: true,
      };

      this.uploadsSignal.update((current) => [...current, initialUpload]);

      const success = await this.runUpload(id);
      if (success) {
        uploaded++;
      } else {
        failed++;
      }
    }

    return { uploaded, failed };
  }

  async retry(id: string): Promise<boolean> {
    const upload = this.uploadsSignal().find((u) => u.id === id);
    if (!upload || !upload.retryable) {
      return false;
    }

    return await this.runUpload(id);
  }

  dismiss(id: string): void {
    this.cleanupUpload(id);
    this.uploadsSignal.update((current) => current.filter((u) => u.id !== id));
  }

  private async runUpload(id: string): Promise<boolean> {
    const internal = this.internalMap.get(id);
    if (!internal) {
      return false;
    }

    try {
      if (!internal.compressed) {
        this.updateUploadState(id, {
          status: 'compressing',
          progress: 0.1,
          error: null,
        });

        const response = await fetch(internal.webPath);
        const sourceBlob = await response.blob();
        const compressed = await this.compressor.compress(sourceBlob);
        internal.compressed = compressed;

        const previewUrl = URL.createObjectURL(compressed.thumb);
        internal.previewUrl = previewUrl;

        this.updateUploadState(id, {
          previewUrl,
          progress: 0.2,
        });
      }

      const paths = photoPaths(internal.eventId, internal.id);

      this.updateUploadState(id, {
        status: 'uploading',
        progress: 0.2,
      });

      if (!internal.thumbUploaded) {
        await this.transport.upload(paths.thumbPath, internal.compressed.thumb);
        internal.thumbUploaded = true;
      }
      this.updateUploadState(id, { progress: 0.4 });

      if (!internal.photoUploaded) {
        await this.transport.upload(paths.photoPath, internal.compressed.photo);
        internal.photoUploaded = true;
      }
      this.updateUploadState(id, { progress: 0.85 });

      this.updateUploadState(id, {
        status: 'saving',
        progress: 0.9,
      });

      await this.repository.insert({
        id: internal.id,
        eventId: internal.eventId,
        width: internal.compressed.width,
        height: internal.compressed.height,
        sizeBytes: internal.compressed.photo.size,
        thumbSizeBytes: internal.compressed.thumb.size,
      });

      this.cleanupUpload(id);
      this.uploadsSignal.update((current) => current.filter((u) => u.id !== id));
      return true;
    } catch (error: unknown) {
      const isNonRetryable =
        error instanceof PhotoTooLargeError || error instanceof PhotoLimitReachedError;
      const retryable = !isNonRetryable;

      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'No pudimos subir la foto. Inténtalo de nuevo.';

      this.updateUploadState(id, {
        status: 'failed',
        error: errorMessage,
        retryable,
      });

      return false;
    }
  }

  private updateUploadState(id: string, patch: Partial<PhotoUpload>): void {
    this.uploadsSignal.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  private cleanupUpload(id: string): void {
    const internal = this.internalMap.get(id);
    if (internal?.previewUrl) {
      URL.revokeObjectURL(internal.previewUrl);
    }
    this.internalMap.delete(id);
  }
}
