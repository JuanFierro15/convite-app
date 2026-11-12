import { Injectable, inject } from '@angular/core';
import {
  CAMERA_PLUGIN_LOADER,
  CameraPermissionService,
} from './camera-permission.service';
import { CapturedPhoto, GALLERY_PICK_LIMIT } from './photo.models';

export type PhotoCaptureOutcome =
  | { status: 'captured'; photos: CapturedPhoto[] }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'permission-permanently-denied' }
  | { status: 'unavailable'; reason: 'web' | 'error' };

export function classifyCameraError(
  error: unknown,
): 'cancelled' | 'permission-denied' | 'unavailable' {
  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const message =
    typeof errObj['message'] === 'string'
      ? errObj['message']
      : typeof error === 'string'
        ? error
        : '';
  const code = typeof errObj['code'] === 'string' ? errObj['code'] : '';
  const combined = `${message} ${code}`.toLowerCase();

  if (
    combined.includes('cancel') ||
    combined.includes('no picture') ||
    combined.includes('no image') ||
    combined.includes('not selected') ||
    combined.includes('os-plug-camr-0006') ||
    combined.includes('os-plug-camr-0020') ||
    combined.includes('os-plug-camr-0013')
  ) {
    return 'cancelled';
  }

  if (
    combined.includes('permission') ||
    combined.includes('os-plug-camr-0003') ||
    combined.includes('os-plug-camr-0005')
  ) {
    return 'permission-denied';
  }

  return 'unavailable';
}

@Injectable({ providedIn: 'root' })
export class PhotoCaptureService {
  private readonly permissionService = inject(CameraPermissionService);
  private readonly cameraLoader = inject(CAMERA_PLUGIN_LOADER);

  async takePhoto(): Promise<PhotoCaptureOutcome> {
    if (!this.permissionService.isNative()) {
      return { status: 'unavailable', reason: 'web' };
    }

    const permission = await this.permissionService.ensureCamera();
    if (permission === 'denied') {
      return { status: 'permission-denied' };
    }
    if (permission === 'permanently-denied') {
      return { status: 'permission-permanently-denied' };
    }
    if (permission === 'unavailable') {
      return { status: 'unavailable', reason: 'error' };
    }

    try {
      const camera = await this.cameraLoader();
      if (!camera.takePhoto) {
        return { status: 'unavailable', reason: 'error' };
      }

      const result = await camera.takePhoto({
        quality: 90,
        correctOrientation: true,
        saveToGallery: false,
        editable: 'no',
        includeMetadata: false,
      });

      const webPath = result?.webPath || result?.uri;
      if (!webPath) {
        return { status: 'cancelled' };
      }

      return {
        status: 'captured',
        photos: [{ webPath }],
      };
    } catch (error: unknown) {
      const classified = classifyCameraError(error);
      if (classified === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (classified === 'permission-denied') {
        return { status: 'permission-denied' };
      }
      return { status: 'unavailable', reason: 'error' };
    }
  }

  async chooseFromGallery(max?: number): Promise<PhotoCaptureOutcome> {
    if (!this.permissionService.isNative()) {
      return { status: 'unavailable', reason: 'web' };
    }

    // En Android el selector de fotos del sistema no necesita permiso.
    const limit = typeof max === 'number' && max > 0 ? max : GALLERY_PICK_LIMIT;

    try {
      const camera = await this.cameraLoader();
      if (!camera.chooseFromGallery) {
        return { status: 'unavailable', reason: 'error' };
      }

      const response = await camera.chooseFromGallery({
        mediaType: 0,
        allowMultipleSelection: true,
        limit,
        quality: 90,
        correctOrientation: true,
        editable: 'no',
        includeMetadata: false,
      });

      const list = Array.isArray(response?.results) ? response.results : [];
      const sliced = list.slice(0, limit);
      const photos: CapturedPhoto[] = [];

      for (const item of sliced) {
        const webPath = item.webPath || item.uri;
        if (webPath) {
          photos.push({ webPath });
        }
      }

      if (photos.length === 0) {
        return { status: 'cancelled' };
      }

      return {
        status: 'captured',
        photos,
      };
    } catch (error: unknown) {
      const classified = classifyCameraError(error);
      if (classified === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (classified === 'permission-denied') {
        return { status: 'permission-denied' };
      }
      return { status: 'unavailable', reason: 'error' };
    }
  }
}
