import { describe, expect, it } from 'vitest';
import {
  EventPhoto,
  canDeletePhoto,
  formatPhotoDate,
  photoPaths,
  uploaderLabel,
} from './photo.models';

describe('photo.models', () => {
  const basePhoto: EventPhoto = {
    id: 'photo-123',
    eventId: 'event-456',
    uploadedBy: 'user-abc',
    uploaderName: 'Juan Pérez',
    uploaderRole: 'owner',
    createdAt: '2026-11-28T16:12:00-05:00',
    width: 1600,
    height: 1200,
    sizeBytes: 150000,
    photoPath: 'event-456/photo-123.jpg',
    thumbPath: 'event-456/photo-123_thumb.jpg',
  };

  describe('photoPaths', () => {
    it('genera las rutas de la foto y de la miniatura correctamente', () => {
      const paths = photoPaths('evt-1', 'pic-9');
      expect(paths).toEqual({
        photoPath: 'evt-1/pic-9.jpg',
        thumbPath: 'evt-1/pic-9_thumb.jpg',
      });
    });
  });

  describe('canDeletePhoto', () => {
    it('permite borrar al propietario del evento aunque no sea el autor', () => {
      expect(canDeletePhoto(basePhoto, 'other-user', true)).toBe(true);
    });

    it('permite borrar al autor de la foto aunque no sea propietario', () => {
      expect(canDeletePhoto(basePhoto, 'user-abc', false)).toBe(true);
    });

    it('deniega el borrado a un ayudante que no es el autor', () => {
      expect(canDeletePhoto(basePhoto, 'other-helper', false)).toBe(false);
    });

    it('deniega el borrado si userId es nulo y no es propietario', () => {
      expect(canDeletePhoto(basePhoto, null, false)).toBe(false);
    });

    it('permite borrar si userId es nulo pero es propietario', () => {
      expect(canDeletePhoto(basePhoto, null, true)).toBe(true);
    });
  });

  describe('uploaderLabel', () => {
    it('indica "Subida por ti" si el usuario actual es el autor', () => {
      expect(uploaderLabel(basePhoto, 'user-abc')).toBe('Subida por ti');
    });

    it('indica "Subida por <nombre>" si no es el usuario actual y hay nombre', () => {
      expect(uploaderLabel(basePhoto, 'other-user')).toBe('Subida por Juan Pérez');
    });

    it('indica "Subida por un propietario" si no hay nombre y el rol es owner', () => {
      const photo: EventPhoto = { ...basePhoto, uploaderName: null, uploaderRole: 'owner' };
      expect(uploaderLabel(photo, 'other-user')).toBe('Subida por un propietario');
    });

    it('indica "Subida por un ayudante" si no hay nombre y el rol es helper', () => {
      const photo: EventPhoto = { ...basePhoto, uploaderName: null, uploaderRole: 'helper' };
      expect(uploaderLabel(photo, 'other-user')).toBe('Subida por un ayudante');
    });

    it('indica "Subida por alguien del equipo" si no hay nombre ni rol reconocido', () => {
      const photo: EventPhoto = { ...basePhoto, uploaderName: null, uploaderRole: null };
      expect(uploaderLabel(photo, 'other-user')).toBe('Subida por alguien del equipo');
    });

    it('no marca como propio si userId es nulo y la foto no tiene autor', () => {
      const photo: EventPhoto = { ...basePhoto, uploadedBy: null, uploaderName: null, uploaderRole: null };
      expect(uploaderLabel(photo, null)).toBe('Subida por alguien del equipo');
    });
  });

  describe('formatPhotoDate', () => {
    it('formatea la fecha y hora en es-CO con zona horaria de Bogotá sin puntos en abreviaturas', () => {
      const formatted = formatPhotoDate('2026-11-28T16:12:00-05:00');
      expect(formatted).toBe('sáb 28 nov · 4:12 p. m.');
    });

    it('formatea correctamente una fecha en domingo', () => {
      const formatted = formatPhotoDate('2026-11-29T09:05:00-05:00');
      expect(formatted).toBe('dom 29 nov · 9:05 a. m.');
    });
  });
});
