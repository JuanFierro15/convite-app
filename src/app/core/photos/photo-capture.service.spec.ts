import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  CAMERA_PLUGIN_LOADER,
  CameraPermissionResult,
  CameraPermissionService,
  CameraPluginLike,
} from './camera-permission.service';
import {
  PhotoCaptureService,
  classifyCameraError,
} from './photo-capture.service';

describe('PhotoCaptureService', () => {
  function setupService(options: {
    isNative?: boolean;
    permissionResult?: CameraPermissionResult;
    plugin?: CameraPluginLike;
  }) {
    const isNative = options.isNative ?? true;
    const permissionResult = options.permissionResult ?? 'granted';
    const plugin = options.plugin ?? {
      checkPermissions: vi.fn(),
      requestPermissions: vi.fn(),
      takePhoto: vi.fn().mockResolvedValue({ webPath: 'blob:http://localhost/sample-pic' }),
      chooseFromGallery: vi.fn().mockResolvedValue({
        results: [{ webPath: 'blob:http://localhost/gallery-1' }],
      }),
    };

    const permissionServiceMock = {
      isNative: vi.fn().mockReturnValue(isNative),
      ensureCamera: vi.fn().mockResolvedValue(permissionResult),
    };

    TestBed.configureTestingModule({
      providers: [
        PhotoCaptureService,
        { provide: CameraPermissionService, useValue: permissionServiceMock },
        { provide: CAMERA_PLUGIN_LOADER, useValue: () => Promise.resolve(plugin) },
      ],
    });

    return {
      service: TestBed.inject(PhotoCaptureService),
      permissionService: permissionServiceMock,
      plugin,
    };
  }

  describe('takePhoto', () => {
    it('devuelve unavailable/web en entorno web sin consultar permisos ni abrir cámara', async () => {
      const { service, permissionService, plugin } = setupService({ isNative: false });
      const result = await service.takePhoto();

      expect(result).toEqual({ status: 'unavailable', reason: 'web' });
      expect(permissionService.ensureCamera).not.toHaveBeenCalled();
      expect(plugin.takePhoto).not.toHaveBeenCalled();
    });

    it('devuelve permission-denied y no abre la cámara si el permiso fue denegado', async () => {
      const { service, plugin } = setupService({ permissionResult: 'denied' });
      const result = await service.takePhoto();

      expect(result).toEqual({ status: 'permission-denied' });
      expect(plugin.takePhoto).not.toHaveBeenCalled();
    });

    it('devuelve permission-permanently-denied si el permiso está denegado para siempre', async () => {
      const { service, plugin } = setupService({ permissionResult: 'permanently-denied' });
      const result = await service.takePhoto();

      expect(result).toEqual({ status: 'permission-permanently-denied' });
      expect(plugin.takePhoto).not.toHaveBeenCalled();
    });

    it('devuelve unavailable/error si ensureCamera reporta unavailable', async () => {
      const { service, plugin } = setupService({ permissionResult: 'unavailable' });
      const result = await service.takePhoto();

      expect(result).toEqual({ status: 'unavailable', reason: 'error' });
      expect(plugin.takePhoto).not.toHaveBeenCalled();
    });

    it('llama a takePhoto con las opciones exactas si el permiso fue concedido', async () => {
      const { service, plugin } = setupService({ permissionResult: 'granted' });
      const result = await service.takePhoto();

      expect(plugin.takePhoto).toHaveBeenCalledWith({
        quality: 90,
        correctOrientation: true,
        saveToGallery: false,
        editable: 'no',
        includeMetadata: false,
      });
      expect(result).toEqual({
        status: 'captured',
        photos: [{ webPath: 'blob:http://localhost/sample-pic' }],
      });
    });

    it('devuelve cancelled si la cámara rechaza por cancelación del usuario', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        takePhoto: vi.fn().mockRejectedValue(new Error('User cancelled photos app')),
      };
      const { service } = setupService({ plugin });

      const result = await service.takePhoto();
      expect(result).toEqual({ status: 'cancelled' });
    });

    it('devuelve permission-denied si la cámara rechaza por error de permiso', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        takePhoto: vi.fn().mockRejectedValue(new Error('Permission denied')),
      };
      const { service } = setupService({ plugin });

      const result = await service.takePhoto();
      expect(result).toEqual({ status: 'permission-denied' });
    });

    it('devuelve unavailable/error si la cámara lanza un fallo inesperado', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        takePhoto: vi.fn().mockRejectedValue(new Error('Internal hardware error')),
      };
      const { service } = setupService({ plugin });

      const result = await service.takePhoto();
      expect(result).toEqual({ status: 'unavailable', reason: 'error' });
    });
  });

  describe('chooseFromGallery', () => {
    it('devuelve unavailable/web en la web sin consultar permisos', async () => {
      const { service, permissionService, plugin } = setupService({ isNative: false });
      const result = await service.chooseFromGallery();

      expect(result).toEqual({ status: 'unavailable', reason: 'web' });
      expect(permissionService.ensureCamera).not.toHaveBeenCalled();
      expect(plugin.chooseFromGallery).not.toHaveBeenCalled();
    });

    it('no llama a ensureCamera y recorta los resultados a max', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        chooseFromGallery: vi.fn().mockResolvedValue({
          results: [
            { webPath: 'p1' },
            { webPath: 'p2' },
            { webPath: 'p3' },
          ],
        }),
      };
      const { service, permissionService } = setupService({ plugin });

      const result = await service.chooseFromGallery(2);
      expect(permissionService.ensureCamera).not.toHaveBeenCalled();
      expect(plugin.chooseFromGallery).toHaveBeenCalledWith({
        mediaType: 0,
        allowMultipleSelection: true,
        limit: 2,
        quality: 90,
        correctOrientation: true,
        editable: 'no',
        includeMetadata: false,
      });
      expect(result).toEqual({
        status: 'captured',
        photos: [{ webPath: 'p1' }, { webPath: 'p2' }],
      });
    });

    it('devuelve cancelled si la galería devuelve una lista vacía', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        chooseFromGallery: vi.fn().mockResolvedValue({ results: [] }),
      };
      const { service } = setupService({ plugin });

      const result = await service.chooseFromGallery();
      expect(result).toEqual({ status: 'cancelled' });
    });

    it('devuelve cancelled si el usuario cancela la selección en la galería', async () => {
      const plugin: CameraPluginLike = {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        chooseFromGallery: vi.fn().mockRejectedValue(new Error('No images selected')),
      };
      const { service } = setupService({ plugin });

      const result = await service.chooseFromGallery();
      expect(result).toEqual({ status: 'cancelled' });
    });
  });

  describe('classifyCameraError', () => {
    it('reconoce errores de cancelación', () => {
      expect(classifyCameraError('User cancelled photos app')).toBe('cancelled');
      expect(classifyCameraError({ message: 'No picture taken' })).toBe('cancelled');
      expect(classifyCameraError({ message: 'No image selected' })).toBe('cancelled');
      expect(classifyCameraError({ code: 'OS-PLUG-CAMR-0006' })).toBe('cancelled');
      expect(classifyCameraError({ code: 'OS-PLUG-CAMR-0020' })).toBe('cancelled');
    });

    it('reconoce errores de permisos', () => {
      expect(classifyCameraError('Camera permission was denied')).toBe('permission-denied');
      expect(classifyCameraError({ code: 'OS-PLUG-CAMR-0003' })).toBe('permission-denied');
    });

    it('clasifica otros errores como unavailable', () => {
      expect(classifyCameraError('Out of memory')).toBe('unavailable');
      expect(classifyCameraError(new Error('Device disconnected'))).toBe('unavailable');
      expect(classifyCameraError(null)).toBe('unavailable');
    });
  });
});
