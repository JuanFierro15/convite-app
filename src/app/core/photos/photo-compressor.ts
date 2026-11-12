import { Injectable } from '@angular/core';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_THUMB_SIDE,
} from './photo.models';

export interface CompressedPhoto {
  photo: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) {
    return { width, height };
  }

  if (width >= height) {
    const scale = maxSide / width;
    return {
      width: maxSide,
      height: Math.round(height * scale),
    };
  }

  const scale = maxSide / height;
  return {
    width: Math.round(width * scale),
    height: maxSide,
  };
}

export function centerSquare(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);
  return { sx, sy, side };
}

export class PhotoTooLargeError extends Error {
  constructor(message = 'Esta foto pesa demasiado aunque se comprima (máx. 2 MB).') {
    super(message);
    this.name = 'PhotoTooLargeError';
  }
}

async function renderCanvasToBlob(
  width: number,
  height: number,
  quality: number,
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo obtener el contexto del canvas.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    draw(ctx as OffscreenCanvasRenderingContext2D);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo obtener el contexto del canvas.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    draw(ctx);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('No se pudo convertir el canvas a Blob.'));
          }
        },
        'image/jpeg',
        quality,
      );
    });
  }

  throw new Error('El entorno actual no soporta Canvas.');
}

@Injectable({ providedIn: 'root' })
export class PhotoCompressor {
  async compress(source: Blob): Promise<CompressedPhoto> {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });

    try {
      const photoSize = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
      const photoBlob = await renderCanvasToBlob(photoSize.width, photoSize.height, 0.8, (ctx) => {
        ctx.drawImage(bitmap as CanvasImageSource, 0, 0, photoSize.width, photoSize.height);
      });

      if (photoBlob.size > PHOTO_MAX_BYTES) {
        throw new PhotoTooLargeError();
      }

      const square = centerSquare(bitmap.width, bitmap.height);
      const thumbBlob = await renderCanvasToBlob(
        PHOTO_THUMB_SIDE,
        PHOTO_THUMB_SIDE,
        0.75,
        (ctx) => {
          ctx.drawImage(
            bitmap as CanvasImageSource,
            square.sx,
            square.sy,
            square.side,
            square.side,
            0,
            0,
            PHOTO_THUMB_SIDE,
            PHOTO_THUMB_SIDE,
          );
        },
      );

      return {
        photo: photoBlob,
        thumb: thumbBlob,
        width: photoSize.width,
        height: photoSize.height,
      };
    } finally {
      bitmap.close();
    }
  }
}
