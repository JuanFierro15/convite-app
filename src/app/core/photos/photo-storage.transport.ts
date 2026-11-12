import { Injectable, InjectionToken, inject } from '@angular/core';
import { toUserError } from '../data/errors';
import { SupabaseService } from '../supabase/supabase.service';
import { PHOTO_BUCKET } from './photo.models';

export interface PhotoStorageTransport {
  upload(path: string, file: Blob, onProgress?: (fraction: number) => void): Promise<void>;
  download(path: string): Promise<Blob>;
  remove(paths: string[]): Promise<void>;
}

export const PHOTO_STORAGE_TRANSPORT = new InjectionToken<PhotoStorageTransport>(
  'PHOTO_STORAGE_TRANSPORT',
  {
    providedIn: 'root',
    factory: () => inject(SupabasePhotoStorageTransport),
  },
);

function isAlreadyExistsError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const errObj = typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const status = String(errObj['statusCode'] ?? errObj['status'] ?? '');
  const message = String(errObj['message'] ?? error);
  const lowerMessage = message.toLowerCase();

  return (
    status === '409' ||
    lowerMessage.includes('already exists') ||
    lowerMessage.includes('duplicate')
  );
}

@Injectable({ providedIn: 'root' })
export class SupabasePhotoStorageTransport implements PhotoStorageTransport {
  private readonly supabase = inject(SupabaseService);

  async upload(
    path: string,
    file: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    const { error } = await this.supabase.client.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '31536000',
      });

    if (error) {
      if (isAlreadyExistsError(error)) {
        onProgress?.(1);
        return;
      }
      throw toUserError(error, 'No pudimos subir la foto.');
    }

    onProgress?.(1);
  }

  async download(path: string): Promise<Blob> {
    const { data, error } = await this.supabase.client.storage
      .from(PHOTO_BUCKET)
      .download(path);

    if (error) {
      throw toUserError(error, 'No pudimos descargar la foto.');
    }

    if (!data) {
      throw toUserError(new Error('No se pudo descargar la foto.'), 'No pudimos descargar la foto.');
    }

    return data;
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const { error } = await this.supabase.client.storage
      .from(PHOTO_BUCKET)
      .remove(paths);

    if (error) {
      throw toUserError(error, 'No pudimos eliminar los archivos de la foto.');
    }
  }
}
