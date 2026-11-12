import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../supabase/supabase.service';
import { PHOTO_BUCKET } from './photo.models';
import { SupabasePhotoStorageTransport } from './photo-storage.transport';

describe('SupabasePhotoStorageTransport', () => {
  function setupTransport(storageMock: {
    upload?: ReturnType<typeof vi.fn>;
    download?: ReturnType<typeof vi.fn>;
    remove?: ReturnType<typeof vi.fn>;
  }) {
    const fromMock = vi.fn().mockReturnValue({
      upload: storageMock.upload ?? vi.fn().mockResolvedValue({ error: null }),
      download: storageMock.download ?? vi.fn().mockResolvedValue({ data: new Blob(['data']), error: null }),
      remove: storageMock.remove ?? vi.fn().mockResolvedValue({ error: null }),
    });

    const supabaseMock = {
      client: {
        storage: {
          from: fromMock,
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        SupabasePhotoStorageTransport,
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    });

    return {
      transport: TestBed.inject(SupabasePhotoStorageTransport),
      fromMock,
      storageMock,
    };
  }

  describe('upload', () => {
    it('sube con los parámetros exactos y reporta progreso al terminar', async () => {
      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      const { transport, fromMock } = setupTransport({ upload: uploadMock });

      const progressSpy = vi.fn();
      const fakeBlob = new Blob(['bytes'], { type: 'image/jpeg' });
      await transport.upload('event-1/pic.jpg', fakeBlob, progressSpy);

      expect(fromMock).toHaveBeenCalledWith(PHOTO_BUCKET);
      expect(uploadMock).toHaveBeenCalledWith('event-1/pic.jpg', fakeBlob, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '31536000',
      });
      expect(progressSpy).toHaveBeenCalledWith(1);
    });

    it('trata error 409 de archivo existente como éxito y reporta progreso', async () => {
      const uploadMock = vi.fn().mockResolvedValue({
        error: { statusCode: '409', message: 'The resource already exists' },
      });
      const { transport } = setupTransport({ upload: uploadMock });

      const progressSpy = vi.fn();
      const fakeBlob = new Blob(['bytes'], { type: 'image/jpeg' });
      await expect(transport.upload('event-1/pic.jpg', fakeBlob, progressSpy)).resolves.toBeUndefined();
      expect(progressSpy).toHaveBeenCalledWith(1);
    });

    it('trata mensaje con Duplicate como éxito', async () => {
      const uploadMock = vi.fn().mockResolvedValue({
        error: { message: 'Duplicate file key' },
      });
      const { transport } = setupTransport({ upload: uploadMock });

      const progressSpy = vi.fn();
      const fakeBlob = new Blob(['bytes'], { type: 'image/jpeg' });
      await expect(transport.upload('event-1/pic.jpg', fakeBlob, progressSpy)).resolves.toBeUndefined();
      expect(progressSpy).toHaveBeenCalledWith(1);
    });

    it('lanza toUserError si la subida falla con otro error', async () => {
      const uploadMock = vi.fn().mockResolvedValue({
        error: { message: 'Bucket not found' },
      });
      const { transport } = setupTransport({ upload: uploadMock });

      const fakeBlob = new Blob(['bytes'], { type: 'image/jpeg' });
      await expect(transport.upload('event-1/pic.jpg', fakeBlob)).rejects.toThrow(
        'No pudimos subir la foto.',
      );
    });
  });

  describe('download', () => {
    it('descarga el archivo y devuelve el Blob', async () => {
      const fakeBlob = new Blob(['downloaded-bytes']);
      const downloadMock = vi.fn().mockResolvedValue({ data: fakeBlob, error: null });
      const { transport, fromMock } = setupTransport({ download: downloadMock });

      const result = await transport.download('event-1/pic.jpg');
      expect(fromMock).toHaveBeenCalledWith(PHOTO_BUCKET);
      expect(downloadMock).toHaveBeenCalledWith('event-1/pic.jpg');
      expect(result).toBe(fakeBlob);
    });

    it('lanza toUserError si la descarga falla', async () => {
      const downloadMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
      const { transport } = setupTransport({ download: downloadMock });

      await expect(transport.download('event-1/pic.jpg')).rejects.toThrow(
        'No pudimos descargar la foto.',
      );
    });
  });

  describe('remove', () => {
    it('elimina los archivos pasados', async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: null });
      const { transport, fromMock } = setupTransport({ remove: removeMock });

      await transport.remove(['event-1/pic.jpg', 'event-1/pic_thumb.jpg']);
      expect(fromMock).toHaveBeenCalledWith(PHOTO_BUCKET);
      expect(removeMock).toHaveBeenCalledWith(['event-1/pic.jpg', 'event-1/pic_thumb.jpg']);
    });

    it('no llama a storage si la lista de rutas está vacía', async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: null });
      const { transport, fromMock } = setupTransport({ remove: removeMock });

      await transport.remove([]);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('lanza toUserError si falla la eliminación', async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: { message: 'Storage error' } });
      const { transport } = setupTransport({ remove: removeMock });

      await expect(transport.remove(['p1'])).rejects.toThrow(
        'No pudimos eliminar los archivos de la foto.',
      );
    });
  });
});
