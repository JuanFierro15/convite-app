import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompressedPhoto, PhotoCompressor, PhotoTooLargeError } from './photo-compressor';
import { PHOTO_STORAGE_TRANSPORT, PhotoStorageTransport } from './photo-storage.transport';
import { PhotoLimitReachedError, PhotosRepository } from './photos.repository';
import { PhotoUploadService } from './photo-upload.service';

describe('PhotoUploadService', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/preview-thumb');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function setupService(options?: {
    compressor?: Partial<PhotoCompressor>;
    transport?: Partial<PhotoStorageTransport>;
    repository?: Partial<PhotosRepository>;
  }) {
    const fakeRawBlob = new Blob(['raw-image-bytes']);
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(fakeRawBlob),
    } as unknown as Response);

    const defaultCompressed: CompressedPhoto = {
      photo: new Blob(['photo-bytes']),
      thumb: new Blob(['thumb-bytes']),
      width: 1600,
      height: 1200,
    };

    const compressorMock: PhotoCompressor = {
      compress: options?.compressor?.compress ?? vi.fn().mockResolvedValue(defaultCompressed),
    } as unknown as PhotoCompressor;

    const transportMock: PhotoStorageTransport = {
      upload: options?.transport?.upload ?? vi.fn().mockResolvedValue(undefined),
      download: options?.transport?.download ?? vi.fn().mockResolvedValue(new Blob([])),
      remove: options?.transport?.remove ?? vi.fn().mockResolvedValue(undefined),
    };

    const repositoryMock: PhotosRepository = {
      list: options?.repository?.list ?? vi.fn().mockResolvedValue([]),
      insert: options?.repository?.insert ?? vi.fn().mockResolvedValue(undefined),
      delete: options?.repository?.delete ?? vi.fn().mockResolvedValue(undefined),
    } as unknown as PhotosRepository;

    TestBed.configureTestingModule({
      providers: [
        PhotoUploadService,
        { provide: PhotoCompressor, useValue: compressorMock },
        { provide: PHOTO_STORAGE_TRANSPORT, useValue: transportMock },
        { provide: PhotosRepository, useValue: repositoryMock },
      ],
    });

    return {
      service: TestBed.inject(PhotoUploadService),
      compressor: compressorMock,
      transport: transportMock,
      repository: repositoryMock,
    };
  }

  it('camino feliz: el id llega igual a la miniatura, la foto y la fila', async () => {
    const uploadCalls: string[] = [];
    const uploadMock = vi.fn().mockImplementation((path: string) => {
      uploadCalls.push(path);
      return Promise.resolve();
    });

    let insertedInput: any = null;
    const insertMock = vi.fn().mockImplementation((input: any) => {
      insertedInput = input;
      return Promise.resolve();
    });

    const { service } = setupService({
      transport: { upload: uploadMock },
      repository: { insert: insertMock },
    });

    const result = await service.enqueue('event-1', [{ webPath: 'blob:file-1' }]);

    expect(result).toEqual({ uploaded: 1, failed: 0 });
    expect(service.uploads()).toHaveLength(0);

    expect(uploadCalls).toHaveLength(2);
    const photoId = insertedInput?.id;
    expect(photoId).toBeDefined();

    expect(uploadCalls[0]).toBe(`event-1/${photoId}_thumb.jpg`);
    expect(uploadCalls[1]).toBe(`event-1/${photoId}.jpg`);
    expect(insertedInput).toMatchObject({
      id: photoId,
      eventId: 'event-1',
      width: 1600,
      height: 1200,
    });
  });

  it('falla en la fila y retry usa el mismo id sin volver a comprimir', async () => {
    let shouldFail = true;
    let compressCount = 0;

    const compressMock = vi.fn().mockImplementation(() => {
      compressCount++;
      return Promise.resolve({
        photo: new Blob(['photo-bytes']),
        thumb: new Blob(['thumb-bytes']),
        width: 1600,
        height: 1200,
      });
    });

    const insertedIds: string[] = [];
    const insertMock = vi.fn().mockImplementation((input: any) => {
      insertedIds.push(input.id);
      if (shouldFail) {
        return Promise.reject(new Error('Database timeout'));
      }
      return Promise.resolve();
    });

    const { service } = setupService({
      compressor: { compress: compressMock },
      repository: { insert: insertMock },
    });

    const result = await service.enqueue('event-1', [{ webPath: 'blob:file-1' }]);
    expect(result).toEqual({ uploaded: 0, failed: 1 });
    expect(service.uploads()).toHaveLength(1);

    const failedUpload = service.uploads()[0];
    expect(failedUpload.status).toBe('failed');
    expect(failedUpload.retryable).toBe(true);
    expect(failedUpload.error).toBe('Database timeout');

    shouldFail = false;
    const retrySuccess = await service.retry(failedUpload.id);

    expect(retrySuccess).toBe(true);
    expect(service.uploads()).toHaveLength(0);
    expect(compressCount).toBe(1);
    expect(insertedIds).toHaveLength(2);
    expect(insertedIds[0]).toBe(insertedIds[1]);
  });

  it('foto demasiado grande marca retryable: false', async () => {
    const compressMock = vi.fn().mockRejectedValue(new PhotoTooLargeError());
    const { service } = setupService({
      compressor: { compress: compressMock },
    });

    const result = await service.enqueue('event-1', [{ webPath: 'blob:oversized' }]);
    expect(result).toEqual({ uploaded: 0, failed: 1 });

    const failedUpload = service.uploads()[0];
    expect(failedUpload.status).toBe('failed');
    expect(failedUpload.retryable).toBe(false);
    expect(failedUpload.error).toBe('Esta foto pesa demasiado aunque se comprima (máx. 2 MB).');
  });

  it('límite alcanzado marca retryable: false', async () => {
    const insertMock = vi.fn().mockRejectedValue(new PhotoLimitReachedError());
    const { service } = setupService({
      repository: { insert: insertMock },
    });

    const result = await service.enqueue('event-1', [{ webPath: 'blob:file' }]);
    expect(result).toEqual({ uploaded: 0, failed: 1 });

    const failedUpload = service.uploads()[0];
    expect(failedUpload.status).toBe('failed');
    expect(failedUpload.retryable).toBe(false);
    expect(failedUpload.error).toBe('La galería llegó al límite de 300 fotos.');
  });

  it('dismiss retira la subida fallida y libera memoria', async () => {
    const compressMock = vi.fn().mockRejectedValue(new PhotoTooLargeError());
    const { service } = setupService({
      compressor: { compress: compressMock },
    });

    await service.enqueue('event-1', [{ webPath: 'blob:oversized' }]);
    const failedId = service.uploads()[0].id;

    service.dismiss(failedId);
    expect(service.uploads()).toHaveLength(0);
  });

  it('uploadsFor filtra reactivamente por eventId', async () => {
    const insertMock = vi.fn().mockRejectedValue(new Error('Connection error'));
    const { service } = setupService({
      repository: { insert: insertMock },
    });

    await service.enqueue('event-A', [{ webPath: 'blob:1' }]);
    await service.enqueue('event-B', [{ webPath: 'blob:2' }]);

    const forA = service.uploadsFor('event-A');
    const forB = service.uploadsFor('event-B');

    expect(forA()).toHaveLength(1);
    expect(forA()[0].eventId).toBe('event-A');

    expect(forB()).toHaveLength(1);
    expect(forB()[0].eventId).toBe('event-B');
  });
});
