import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_THUMB_SIDE,
} from './photo.models';
import {
  PhotoCompressor,
  PhotoTooLargeError,
  centerSquare,
  fitWithin,
} from './photo-compressor';

describe('PhotoCompressor', () => {
  describe('fitWithin', () => {
    it('escala 4000x3000 a 1600x1200', () => {
      const result = fitWithin(4000, 3000, 1600);
      expect(result).toEqual({ width: 1600, height: 1200 });
    });

    it('escala 3000x4000 a 1200x1600', () => {
      const result = fitWithin(3000, 4000, 1600);
      expect(result).toEqual({ width: 1200, height: 1600 });
    });

    it('deja intacta una imagen de 800x600', () => {
      const result = fitWithin(800, 600, 1600);
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('deja intacta una imagen de 1600x1600 exacto', () => {
      const result = fitWithin(1600, 1600, 1600);
      expect(result).toEqual({ width: 1600, height: 1600 });
    });
  });

  describe('centerSquare', () => {
    it('centra el recorte cuadrado en imagen horizontal', () => {
      const result = centerSquare(4000, 3000);
      expect(result).toEqual({ side: 3000, sx: 500, sy: 0 });
    });

    it('centra el recorte cuadrado en imagen vertical', () => {
      const result = centerSquare(3000, 4000);
      expect(result).toEqual({ side: 3000, sx: 0, sy: 500 });
    });

    it('mantiene el origen en imagen cuadrada', () => {
      const result = centerSquare(2000, 2000);
      expect(result).toEqual({ side: 2000, sx: 0, sy: 0 });
    });
  });

  describe('compress', () => {
    let originalCreateImageBitmap: typeof globalThis.createImageBitmap;
    let originalOffscreenCanvas: typeof globalThis.OffscreenCanvas;

    beforeEach(() => {
      originalCreateImageBitmap = globalThis.createImageBitmap;
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      TestBed.configureTestingModule({
        providers: [PhotoCompressor],
      });
    });

    afterEach(() => {
      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.OffscreenCanvas = originalOffscreenCanvas;
      vi.restoreAllMocks();
    });

    it('comprime correctamente una imagen y genera foto y miniatura', async () => {
      const closeSpy = vi.fn();
      const fakeBitmap = {
        width: 4000,
        height: 3000,
        close: closeSpy,
      };

      globalThis.createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap);

      const fakeBlobPhoto = new Blob(['photo-bytes'], { type: 'image/jpeg' });
      const fakeBlobThumb = new Blob(['thumb-bytes'], { type: 'image/jpeg' });
      let callCount = 0;

      // Mock de OffscreenCanvas
      class MockOffscreenCanvas {
        width: number;
        height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }
        getContext() {
          return {
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'low',
            drawImage: vi.fn(),
          };
        }
        convertToBlob() {
          callCount++;
          return Promise.resolve(callCount === 1 ? fakeBlobPhoto : fakeBlobThumb);
        }
      }
      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      const service = TestBed.inject(PhotoCompressor);
      const sourceBlob = new Blob(['raw-data'], { type: 'image/jpeg' });
      const result = await service.compress(sourceBlob);

      expect(result.width).toBe(PHOTO_MAX_SIDE);
      expect(result.height).toBe(1200);
      expect(result.photo).toBe(fakeBlobPhoto);
      expect(result.thumb).toBe(fakeBlobThumb);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('lanza PhotoTooLargeError y cierra el bitmap si la foto supera los 2 MB', async () => {
      const closeSpy = vi.fn();
      const fakeBitmap = {
        width: 3000,
        height: 2000,
        close: closeSpy,
      };

      globalThis.createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap);

      const oversizedBlob = {
        size: PHOTO_MAX_BYTES + 1,
        type: 'image/jpeg',
      } as unknown as Blob;

      class MockOffscreenCanvas {
        constructor(public width: number, public height: number) {}
        getContext() {
          return {
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'low',
            drawImage: vi.fn(),
          };
        }
        convertToBlob() {
          return Promise.resolve(oversizedBlob);
        }
      }
      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      const service = TestBed.inject(PhotoCompressor);
      const sourceBlob = new Blob(['raw-data'], { type: 'image/jpeg' });

      await expect(service.compress(sourceBlob)).rejects.toThrow(
        'Esta foto pesa demasiado aunque se comprima (máx. 2 MB).',
      );
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
