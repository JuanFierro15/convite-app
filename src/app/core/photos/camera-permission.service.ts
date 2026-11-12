import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AppSettings, AppSettingsPlugin } from './app-settings.plugin';

export type CameraPermissionResult =
  | 'granted'
  | 'denied'
  | 'permanently-denied'
  | 'unavailable';

export interface CameraPluginLike {
  checkPermissions(): Promise<{ camera: string; photos?: string }>;
  requestPermissions(permissions?: { permissions: string[] }): Promise<{ camera: string; photos?: string }>;
  takePhoto?(options: unknown): Promise<{ webPath?: string; uri?: string }>;
  chooseFromGallery?(options: unknown): Promise<{ results: Array<{ webPath?: string; uri?: string }> }>;
}

export type CameraPluginLoader = () => Promise<CameraPluginLike>;

export const CAMERA_PLUGIN_LOADER = new InjectionToken<CameraPluginLoader>(
  'CAMERA_PLUGIN_LOADER',
  {
    providedIn: 'root',
    factory: () => async () => {
      const { Camera } = await import('@capacitor/camera');
      // Un plugin de Capacitor es un Proxy que también responde a "then": si se devuelve
      // tal cual desde una promesa, se trata como thenable y se llama a un método nativo inexistente.
      return {
        checkPermissions: () => Camera.checkPermissions(),
        requestPermissions: (permissions) =>
          Camera.requestPermissions(permissions as Parameters<typeof Camera.requestPermissions>[0]),
        takePhoto: (options) => Camera.takePhoto(options as Parameters<typeof Camera.takePhoto>[0]),
        chooseFromGallery: (options) =>
          Camera.chooseFromGallery(options as Parameters<typeof Camera.chooseFromGallery>[0]),
      } satisfies CameraPluginLike;
    },
  },
);

export type IsNativePlatformFn = () => boolean;

export const IS_NATIVE_PLATFORM = new InjectionToken<IsNativePlatformFn>(
  'IS_NATIVE_PLATFORM',
  {
    providedIn: 'root',
    factory: () => () => Capacitor.isNativePlatform(),
  },
);

export const APP_SETTINGS_PLUGIN = new InjectionToken<AppSettingsPlugin>(
  'APP_SETTINGS_PLUGIN',
  {
    providedIn: 'root',
    factory: () => AppSettings,
  },
);

@Injectable({ providedIn: 'root' })
export class CameraPermissionService {
  private readonly isNativeFn = inject(IS_NATIVE_PLATFORM);
  private readonly cameraLoader = inject(CAMERA_PLUGIN_LOADER);
  private readonly appSettings = inject(APP_SETTINGS_PLUGIN);

  isNative(): boolean {
    return this.isNativeFn();
  }

  async ensureCamera(): Promise<CameraPermissionResult> {
    if (!this.isNative()) {
      return 'unavailable';
    }

    try {
      const camera = await this.cameraLoader();
      const status = await camera.checkPermissions();

      if (status.camera === 'granted') {
        return 'granted';
      }

      if (status.camera === 'denied') {
        return 'permanently-denied';
      }

      if (status.camera === 'prompt' || status.camera === 'prompt-with-rationale') {
        const requested = await camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera === 'granted') {
          return 'granted';
        }
        if (requested.camera === 'denied') {
          return 'permanently-denied';
        }
        return 'denied';
      }

      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async openAppSettings(): Promise<boolean> {
    if (!this.isNative()) {
      return false;
    }

    try {
      const result = await this.appSettings.open();
      return result?.opened ?? false;
    } catch {
      return false;
    }
  }
}
