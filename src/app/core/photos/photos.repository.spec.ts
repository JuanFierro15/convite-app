import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../supabase/supabase.service';
import { EventPhoto } from './photo.models';
import { PHOTO_STORAGE_TRANSPORT, PhotoStorageTransport } from './photo-storage.transport';
import { PhotoLimitReachedError, PhotosRepository } from './photos.repository';

describe('PhotosRepository', () => {
  function setupRepository(options?: {
    photosData?: unknown[];
    photosError?: unknown;
    membersData?: unknown[];
    membersError?: unknown;
    insertError?: unknown;
    deleteData?: unknown[];
    deleteError?: unknown;
    removeThrows?: boolean;
  }) {
    const photosQueryMock: any = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    };

    photosQueryMock.select.mockImplementation((fields?: string) => {
      if (fields === 'id') {
        return Promise.resolve({
          data: options?.deleteData ?? [{ id: 'p1' }],
          error: options?.deleteError ?? null,
        });
      }
      return photosQueryMock;
    });

    photosQueryMock.eq.mockReturnValue(photosQueryMock);
    photosQueryMock.order.mockReturnValue(photosQueryMock);
    photosQueryMock.delete.mockReturnValue(photosQueryMock);
    photosQueryMock.insert.mockResolvedValue({ error: options?.insertError ?? null });

    photosQueryMock.then = (resolve: any, reject: any) => {
      return Promise.resolve({
        data: options?.photosData ?? [],
        error: options?.photosError ?? null,
      }).then(resolve, reject);
    };

    const membersQueryMock: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          data: options?.membersData ?? [],
          error: options?.membersError ?? null,
        });
      }),
    };

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'event_photos') {
        return photosQueryMock;
      }
      if (table === 'event_members') {
        return membersQueryMock;
      }
      return photosQueryMock;
    });

    const transportMock: PhotoStorageTransport = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(new Blob([''])),
      remove: options?.removeThrows
        ? vi.fn().mockRejectedValue(new Error('Storage delete failed'))
        : vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        PhotosRepository,
        {
          provide: SupabaseService,
          useValue: { client: { from: fromMock } },
        },
        {
          provide: PHOTO_STORAGE_TRANSPORT,
          useValue: transportMock,
        },
      ],
    });

    return {
      repository: TestBed.inject(PhotosRepository),
      photosQueryMock,
      membersQueryMock,
      transportMock,
    };
  }

  describe('list', () => {
    it('mapea correctamente las filas combinando datos del autor y miembro', async () => {
      const photosData = [
        {
          id: 'photo-1',
          event_id: 'evt-1',
          uploaded_by: 'user-1',
          created_at: '2026-11-28T10:00:00Z',
          width: 1600,
          height: 1200,
          size_bytes: 500000,
          photo_path: 'evt-1/photo-1.jpg',
          thumb_path: 'evt-1/photo-1_thumb.jpg',
        },
        {
          id: 'photo-2',
          event_id: 'evt-1',
          uploaded_by: null,
          created_at: '2026-11-28T09:00:00Z',
          width: 800,
          height: 600,
          size_bytes: 200000,
          photo_path: 'evt-1/photo-2.jpg',
          thumb_path: 'evt-1/photo-2_thumb.jpg',
        },
      ];

      const membersData = [
        {
          user_id: 'user-1',
          role: 'owner',
          display_name: 'Carlos Ruiz',
        },
      ];

      const { repository } = setupRepository({ photosData, membersData });
      const result = await repository.list('evt-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'photo-1',
        eventId: 'evt-1',
        uploadedBy: 'user-1',
        uploaderName: 'Carlos Ruiz',
        uploaderRole: 'owner',
        createdAt: '2026-11-28T10:00:00Z',
        width: 1600,
        height: 1200,
        sizeBytes: 500000,
        photoPath: 'evt-1/photo-1.jpg',
        thumbPath: 'evt-1/photo-1_thumb.jpg',
      });
      expect(result[1].uploaderName).toBeNull();
      expect(result[1].uploaderRole).toBeNull();
    });
  });

  describe('insert', () => {
    it('lanza PhotoLimitReachedError si el error contiene photo_limit_reached', async () => {
      const { repository } = setupRepository({
        insertError: { message: 'check constraint photo_limit_reached violated' },
      });

      await expect(
        repository.insert({
          id: 'p1',
          eventId: 'evt-1',
          width: 1600,
          height: 1200,
          sizeBytes: 200000,
          thumbSizeBytes: 30000,
        }),
      ).rejects.toThrow(PhotoLimitReachedError);
    });

    it('trata error 23505 (clave duplicada por reintento) como éxito', async () => {
      const { repository } = setupRepository({
        insertError: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        repository.insert({
          id: 'p1',
          eventId: 'evt-1',
          width: 1600,
          height: 1200,
          sizeBytes: 200000,
          thumbSizeBytes: 30000,
        }),
      ).resolves.toBeUndefined();
    });

    it('lanza toUserError si ocurre otro error de base de datos', async () => {
      const { repository } = setupRepository({
        insertError: { message: 'Database connection failed' },
      });

      await expect(
        repository.insert({
          id: 'p1',
          eventId: 'evt-1',
          width: 1600,
          height: 1200,
          sizeBytes: 200000,
          thumbSizeBytes: 30000,
        }),
      ).rejects.toThrow('No pudimos guardar la foto.');
    });
  });

  describe('delete', () => {
    const samplePhoto: EventPhoto = {
      id: 'photo-1',
      eventId: 'evt-1',
      uploadedBy: 'u1',
      uploaderName: 'Carlos',
      uploaderRole: 'owner',
      createdAt: '2026-11-28T10:00:00Z',
      width: 1600,
      height: 1200,
      sizeBytes: 500000,
      photoPath: 'evt-1/photo-1.jpg',
      thumbPath: 'evt-1/photo-1_thumb.jpg',
    };

    it('lanza mensaje exacto y no borra archivos si delete devuelve 0 filas', async () => {
      const { repository, transportMock } = setupRepository({
        deleteData: [],
      });

      await expect(repository.delete(samplePhoto)).rejects.toThrow(
        'No tienes permiso para borrar esta foto.',
      );
      expect(transportMock.remove).not.toHaveBeenCalled();
    });

    it('borra la fila y llama a remove con las dos rutas', async () => {
      const { repository, transportMock } = setupRepository({
        deleteData: [{ id: 'photo-1' }],
      });

      await repository.delete(samplePhoto);
      expect(transportMock.remove).toHaveBeenCalledWith([
        'evt-1/photo-1.jpg',
        'evt-1/photo-1_thumb.jpg',
      ]);
    });

    it('no lanza si remove en storage falla tras haber borrado la fila', async () => {
      const { repository, transportMock } = setupRepository({
        deleteData: [{ id: 'photo-1' }],
        removeThrows: true,
      });

      await expect(repository.delete(samplePhoto)).resolves.toBeUndefined();
      expect(transportMock.remove).toHaveBeenCalledWith([
        'evt-1/photo-1.jpg',
        'evt-1/photo-1_thumb.jpg',
      ]);
    });
  });
});
