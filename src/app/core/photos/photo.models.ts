export const PHOTO_LIMIT = 300;
export const PHOTO_MAX_BYTES = 2_097_152;
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_THUMB_SIDE = 400;
export const PHOTO_BUCKET = 'event-photos';
export const GALLERY_PICK_LIMIT = 10;

export type MemberRole = 'owner' | 'helper';

export interface EventPhoto {
  id: string;
  eventId: string;
  uploadedBy: string | null;
  uploaderName: string | null;
  uploaderRole: MemberRole | null;
  createdAt: string;
  width: number;
  height: number;
  sizeBytes: number;
  photoPath: string;
  thumbPath: string;
}

export interface CapturedPhoto {
  webPath: string;
}

export type PhotoUploadStatus = 'compressing' | 'uploading' | 'saving' | 'failed';

export interface PhotoUpload {
  id: string;
  eventId: string;
  previewUrl: string | null;
  status: PhotoUploadStatus;
  progress: number;
  error: string | null;
  retryable: boolean;
}

export function photoPaths(
  eventId: string,
  photoId: string,
): { photoPath: string; thumbPath: string } {
  return {
    photoPath: `${eventId}/${photoId}.jpg`,
    thumbPath: `${eventId}/${photoId}_thumb.jpg`,
  };
}

export function canDeletePhoto(
  photo: EventPhoto,
  userId: string | null,
  isOwner: boolean,
): boolean {
  return isOwner || (userId !== null && photo.uploadedBy === userId);
}

export function uploaderLabel(photo: EventPhoto, userId: string | null): string {
  if (userId !== null && photo.uploadedBy === userId) {
    return 'Subida por ti';
  }
  if (photo.uploaderName && photo.uploaderName.trim().length > 0) {
    return `Subida por ${photo.uploaderName.trim()}`;
  }
  if (photo.uploaderRole === 'owner') {
    return 'Subida por un propietario';
  }
  if (photo.uploaderRole === 'helper') {
    return 'Subida por un ayudante';
  }
  return 'Subida por alguien del equipo';
}

const bogotaDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const bogotaTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatPhotoDate(iso: string): string {
  const date = new Date(iso);
  const parts = bogotaDateFormatter.formatToParts(date);
  const weekday = (parts.find((p) => p.type === 'weekday')?.value ?? '').replace(/\./g, '');
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/\./g, '');
  const time = bogotaTimeFormatter.format(date).replace(/\s+/g, ' ');
  return `${weekday} ${day} ${month} · ${time}`;
}
