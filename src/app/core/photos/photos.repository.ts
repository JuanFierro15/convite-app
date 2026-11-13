import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from '../data/errors';
import { SupabaseService } from '../supabase/supabase.service';
import { EventPhoto, MemberRole } from './photo.models';
import { PHOTO_STORAGE_TRANSPORT } from './photo-storage.transport';

export class PhotoLimitReachedError extends Error {
  constructor(message = 'La galería llegó al límite de 300 fotos.') {
    super(message);
    this.name = 'PhotoLimitReachedError';
  }
}

export interface InsertPhotoInput {
  id: string;
  eventId: string;
  width: number;
  height: number;
  sizeBytes: number;
  thumbSizeBytes: number;
}

interface RawPhotoRow {
  id: string;
  event_id: string;
  uploaded_by: string | null;
  created_at: string;
  width: number;
  height: number;
  size_bytes: number;
  photo_path: string;
  thumb_path: string;
}

interface RawMemberRow {
  user_id: string;
  role: string | null;
  display_name: string | null;
}

@Injectable({ providedIn: 'root' })
export class PhotosRepository {
  private readonly supabase = inject(SupabaseService);
  private readonly transport = inject(PHOTO_STORAGE_TRANSPORT);

  // event_photos todavía no está en database.types.ts: sin este cliente sin tipos, TypeScript rechaza la tabla.
  private get untypedClient(): SupabaseClient {
    return this.supabase.client as unknown as SupabaseClient;
  }

  async list(eventId: string): Promise<EventPhoto[]> {
    const client = this.untypedClient;

    const [photosResponse, membersResponse] = await Promise.all([
      client
        .from('event_photos')
        .select('id, event_id, uploaded_by, created_at, width, height, size_bytes, photo_path, thumb_path')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      client
        .from('event_members')
        .select('user_id, role, display_name')
        .eq('event_id', eventId),
    ]);

    if (photosResponse.error) {
      throw toUserError(photosResponse.error, 'No pudimos cargar las fotos.');
    }

    if (membersResponse.error) {
      throw toUserError(membersResponse.error, 'No pudimos cargar la información del equipo.');
    }

    const rawMembers: RawMemberRow[] = Array.isArray(membersResponse.data) ? membersResponse.data : [];
    const memberMap = new Map<string, { role: MemberRole | null; displayName: string | null }>();

    for (const member of rawMembers) {
      memberMap.set(member.user_id, {
        role: (member.role === 'owner' || member.role === 'helper' ? member.role : null),
        displayName: member.display_name ?? null,
      });
    }

    const rawPhotos: RawPhotoRow[] = Array.isArray(photosResponse.data) ? photosResponse.data : [];

    return rawPhotos.map((row) => {
      const member = row.uploaded_by ? memberMap.get(row.uploaded_by) : undefined;
      return {
        id: row.id,
        eventId: row.event_id,
        uploadedBy: row.uploaded_by ?? null,
        uploaderName: member?.displayName ?? null,
        uploaderRole: member?.role ?? null,
        createdAt: row.created_at,
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        photoPath: row.photo_path,
        thumbPath: row.thumb_path,
      };
    });
  }

  async insert(input: InsertPhotoInput): Promise<void> {
    const client = this.untypedClient;

    const { error } = await client
      .from('event_photos')
      .insert({
        id: input.id,
        event_id: input.eventId,
        width: input.width,
        height: input.height,
        size_bytes: input.sizeBytes,
        thumb_size_bytes: input.thumbSizeBytes,
      });

    if (error) {
      const message = error.message ?? '';
      const details = error.details ?? '';
      const code = error.code ?? '';
      const combined = `${message} ${details} ${code}`;

      if (combined.includes('photo_limit_reached')) {
        throw new PhotoLimitReachedError();
      }

      if (combined.includes('23505')) {
        return;
      }

      throw toUserError(error, 'No pudimos guardar la foto.');
    }
  }

  async delete(photo: EventPhoto): Promise<void> {
    const client = this.untypedClient;

    const { data, error } = await client
      .from('event_photos')
      .delete()
      .eq('id', photo.id)
      .select('id');

    if (error) {
      throw toUserError(error, 'No pudimos borrar la foto.');
    }

    if (!data || data.length === 0) {
      throw toUserError(
        new Error('No tienes permiso para borrar esta foto.'),
        'No tienes permiso para borrar esta foto.',
      );
    }

    try {
      await this.transport.remove([photo.photoPath, photo.thumbPath]);
    } catch {
      // Si falla Storage no se propaga el error: la foto ya no se ve en la galería.
    }
  }
}
