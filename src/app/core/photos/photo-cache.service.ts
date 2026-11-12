import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { PHOTO_STORAGE_TRANSPORT } from './photo-storage.transport';

@Injectable({ providedIn: 'root' })
export class PhotoCacheService {
  private readonly auth = inject(AuthService);
  private readonly transport = inject(PHOTO_STORAGE_TRANSPORT);

  private readonly urls = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user === null) {
        this.clear();
      }
    });
  }

  peek(path: string): string | null {
    return this.urls.get(path) ?? null;
  }

  async getUrl(path: string): Promise<string> {
    const existing = this.peek(path);
    if (existing !== null) {
      return existing;
    }

    const pending = this.inFlight.get(path);
    if (pending) {
      return pending;
    }

    const downloadPromise = this.transport
      .download(path)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        this.urls.set(path, objectUrl);
        return objectUrl;
      })
      .finally(() => {
        this.inFlight.delete(path);
      });

    this.inFlight.set(path, downloadPromise);
    return downloadPromise;
  }

  forget(paths: string[]): void {
    for (const path of paths) {
      const url = this.urls.get(path);
      if (url) {
        URL.revokeObjectURL(url);
        this.urls.delete(path);
      }
      this.inFlight.delete(path);
    }
  }

  clear(): void {
    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
    this.inFlight.clear();
  }
}
