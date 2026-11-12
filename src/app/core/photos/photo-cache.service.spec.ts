import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { PHOTO_STORAGE_TRANSPORT, PhotoStorageTransport } from './photo-storage.transport';
import { PhotoCacheService } from './photo-cache.service';

describe('PhotoCacheService', () => {
  let userSignal: ReturnType<typeof signal<User | null>>;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    userSignal = signal<User | null>({ id: 'u1' } as User);

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    let urlCounter = 0;
    URL.createObjectURL = vi.fn().mockImplementation(() => `blob:http://localhost/object-${++urlCounter}`);
    revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function setupService(transportMock?: Partial<PhotoStorageTransport>) {
    const transport: PhotoStorageTransport = {
      upload: vi.fn(),
      download: transportMock?.download ?? vi.fn().mockResolvedValue(new Blob(['img'])),
      remove: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PhotoCacheService,
        {
          provide: AuthService,
          useValue: { user: userSignal },
        },
        {
          provide: PHOTO_STORAGE_TRANSPORT,
          useValue: transport,
        },
      ],
    });

    return {
      service: TestBed.inject(PhotoCacheService),
      transport,
    };
  }

  it('dos getUrl en paralelo para la misma ruta bajan una sola vez', async () => {
    let resolveDownload: (blob: Blob) => void;
    const downloadPromise = new Promise<Blob>((resolve) => {
      resolveDownload = resolve;
    });

    const downloadMock = vi.fn().mockReturnValue(downloadPromise);
    const { service } = setupService({ download: downloadMock });

    const p1 = service.getUrl('event-1/photo.jpg');
    const p2 = service.getUrl('event-1/photo.jpg');

    expect(downloadMock).toHaveBeenCalledTimes(1);

    resolveDownload!(new Blob(['data']));

    const [url1, url2] = await Promise.all([p1, p2]);
    expect(url1).toBe(url2);
    expect(service.peek('event-1/photo.jpg')).toBe(url1);
  });

  it('una descarga fallida no queda guardada y permite reintentar', async () => {
    const downloadMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Blob(['retry-data']));

    const { service } = setupService({ download: downloadMock });

    await expect(service.getUrl('event-1/failed.jpg')).rejects.toThrow('Network error');
    expect(service.peek('event-1/failed.jpg')).toBeNull();

    // Reintento:
    const url = await service.getUrl('event-1/failed.jpg');
    expect(url).toMatch(/^blob:/);
    expect(service.peek('event-1/failed.jpg')).toBe(url);
    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it('forget revoca y elimina las rutas indicadas', async () => {
    const { service } = setupService();

    const u1 = await service.getUrl('p1.jpg');
    const u2 = await service.getUrl('p2.jpg');

    expect(service.peek('p1.jpg')).toBe(u1);
    expect(service.peek('p2.jpg')).toBe(u2);

    service.forget(['p1.jpg']);

    expect(revokeSpy).toHaveBeenCalledWith(u1);
    expect(service.peek('p1.jpg')).toBeNull();
    expect(service.peek('p2.jpg')).toBe(u2);
  });

  it('clear revoca todas las URLs en memoria', async () => {
    const { service } = setupService();

    const u1 = await service.getUrl('p1.jpg');
    const u2 = await service.getUrl('p2.jpg');

    service.clear();

    expect(revokeSpy).toHaveBeenCalledWith(u1);
    expect(revokeSpy).toHaveBeenCalledWith(u2);
    expect(service.peek('p1.jpg')).toBeNull();
    expect(service.peek('p2.jpg')).toBeNull();
  });

  it('limpia la caché cuando el usuario cierra sesión', async () => {
    const { service } = setupService();

    const u1 = await service.getUrl('p1.jpg');
    expect(service.peek('p1.jpg')).toBe(u1);

    userSignal.set(null);
    TestBed.flushEffects();

    expect(revokeSpy).toHaveBeenCalledWith(u1);
    expect(service.peek('p1.jpg')).toBeNull();
  });
});
