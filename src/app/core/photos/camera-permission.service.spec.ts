import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppSettingsPlugin } from './app-settings.plugin';
import {
  APP_SETTINGS_PLUGIN,
  CAMERA_PLUGIN_LOADER,
  CameraPermissionService,
  CameraPluginLike,
  IS_NATIVE_PLATFORM,
} from './camera-permission.service';

describe('CameraPermissionService', () => {
  function setupService(options: {
    isNative?: boolean;
    plugin?: CameraPluginLike;
    pluginThrows?: boolean;
    appSettings?: AppSettingsPlugin;
  }) {
    const isNative = options.isNative ?? true;
    const plugin = options.plugin ?? {
      checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
      requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    };

    const appSettingsMock: AppSettingsPlugin = options.appSettings ?? {
      open: vi.fn().mockResolvedValue({ opened: true }),
    };

    TestBed.configureTestingModule({
      providers: [
        CameraPermissionService,
        {
          provide: IS_NATIVE_PLATFORM,
          useValue: () => isNative,
        },
        {
          provide: CAMERA_PLUGIN_LOADER,
          useValue: options.pluginThrows
            ? () => Promise.reject(new Error('Plugin load error'))
            : () => Promise.resolve(plugin),
        },
        {
          provide: APP_SETTINGS_PLUGIN,
          useValue: appSettingsMock,
        },
      ],
    });

    return {
      service: TestBed.inject(CameraPermissionService),
      plugin,
      appSettings: appSettingsMock,
    };
  }

  describe('ensureCamera', () => {
    it('devuelve unavailable si no es plataforma nativa (web)', async () => {
      const { service, plugin } = setupService({ isNative: false });
      const result = await service.ensureCamera();

      expect(result).toBe('unavailable');
      expect(plugin.checkPermissions).not.toHaveBeenCalled();
    });

    it('devuelve granted si el permiso ya está concedido', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
        requestPermissions: vi.fn(),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('granted');
      expect(plugin.requestPermissions).not.toHaveBeenCalled();
    });

    it('devuelve permanently-denied sin pedir permisos si checkPermissions devuelve denied', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'denied' }),
        requestPermissions: vi.fn(),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('permanently-denied');
      expect(plugin.requestPermissions).not.toHaveBeenCalled();
    });

    it('pide permiso en estado prompt y devuelve granted si se concede', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'prompt' }),
        requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('granted');
      expect(plugin.requestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] });
    });

    it('pide permiso en estado prompt y devuelve permanently-denied si se niega definitivamente', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'prompt' }),
        requestPermissions: vi.fn().mockResolvedValue({ camera: 'denied' }),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('permanently-denied');
    });

    it('devuelve denied si tras pedir permiso queda en prompt-with-rationale', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'prompt-with-rationale' }),
        requestPermissions: vi.fn().mockResolvedValue({ camera: 'prompt-with-rationale' }),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('denied');
    });

    it('devuelve unavailable si checkPermissions lanza una excepción', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockRejectedValue(new Error('Fallo de hardware')),
        requestPermissions: vi.fn(),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('unavailable');
    });

    it('devuelve unavailable si requestPermissions lanza una excepción', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn().mockResolvedValue({ camera: 'prompt' }),
        requestPermissions: vi.fn().mockRejectedValue(new Error('Fallo inesperado')),
      };
      const { service } = setupService({ isNative: true, plugin });

      const result = await service.ensureCamera();
      expect(result).toBe('unavailable');
    });

    it('devuelve unavailable si la carga del plugin falla', async () => {
      const { service } = setupService({ isNative: true, pluginThrows: true });

      const result = await service.ensureCamera();
      expect(result).toBe('unavailable');
    });
  });

  describe('openAppSettings', () => {
    it('devuelve false en la web sin llamar al plugin nativo', async () => {
      const openMock = vi.fn().mockResolvedValue({ opened: true });
      const { service } = setupService({ isNative: false, appSettings: { open: openMock } });

      const result = await service.openAppSettings();
      expect(result).toBe(false);
      expect(openMock).not.toHaveBeenCalled();
    });

    it('devuelve true si el plugin abre los ajustes exitosamente en nativo', async () => {
      const openMock = vi.fn().mockResolvedValue({ opened: true });
      const { service } = setupService({ isNative: true, appSettings: { open: openMock } });

      const result = await service.openAppSettings();
      expect(result).toBe(true);
      expect(openMock).toHaveBeenCalled();
    });

    it('devuelve false si el plugin responde opened: false', async () => {
      const openMock = vi.fn().mockResolvedValue({ opened: false });
      const { service } = setupService({ isNative: true, appSettings: { open: openMock } });

      const result = await service.openAppSettings();
      expect(result).toBe(false);
    });

    it('devuelve false si el plugin lanza una excepción', async () => {
      const openMock = vi.fn().mockRejectedValue(new Error('Activity not found'));
      const { service } = setupService({ isNative: true, appSettings: { open: openMock } });

      const result = await service.openAppSettings();
      expect(result).toBe(false);
    });
  });

  describe('CAMERA_PLUGIN_LOADER por defecto', () => {
    it('devuelve un objeto que no es thenable, para que await no confunda el Proxy del plugin con una promesa', async () => {
      TestBed.resetTestingModule();
      const loader = TestBed.inject(CAMERA_PLUGIN_LOADER);
      const camera = await loader();
      expect((camera as unknown as { then?: unknown }).then).toBeUndefined();
      expect(typeof camera.checkPermissions).toBe('function');
      expect(typeof camera.takePhoto).toBe('function');
    });
  });
});
