import { Injectable, inject } from '@angular/core';
import { TeamProfileRow } from '../models/team-profiles';
import { SupabaseService } from '../supabase/supabase.service';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

@Injectable({ providedIn: 'root' })
export class TeamProfilesRepository {
  private readonly supabase = inject(SupabaseService);

  async list(teamId: string): Promise<TeamProfileRow[]> {
    const { data, error } = await this.supabase.client
      .from('team_profiles')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return data ?? [];
  }

  async create(id: string, teamId: string, name: string, sortOrder: number): Promise<TeamProfileRow> {
    const { data, error } = await this.supabase.client
      .from('team_profiles')
      .insert({
        id,
        team_id: teamId,
        name: name.trim(),
        sort_order: sortOrder,
      })
      .select('*')
      .single();

    if (error) {
      if ((error as { code?: string })?.code === '23505') {
        const { data: existing, error: selectError } = await this.supabase.client
          .from('team_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!selectError && existing) {
          return existing;
        }
      }
      throw toUserError(error);
    }

    return data;
  }

  async rename(id: string, name: string): Promise<TeamProfileRow> {
    const { data, error } = await this.supabase.client
      .from('team_profiles')
      .update({
        name: name.trim(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async setArchived(id: string, archived: boolean): Promise<TeamProfileRow> {
    const { data, error } = await this.supabase.client
      .from('team_profiles')
      .update({
        archived_at: archived ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('team_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      throw toUserError(error);
    }
  }

  async swapOrder(a: TeamProfileRow, b: TeamProfileRow): Promise<void> {
    const orderA = b.sort_order;
    const orderB = a.sort_order === b.sort_order ? a.sort_order + 1 : a.sort_order;

    const { error: errorA } = await this.supabase.client
      .from('team_profiles')
      .update({ sort_order: orderA })
      .eq('id', a.id);

    if (errorA) {
      throw toUserError(errorA);
    }

    const { error: errorB } = await this.supabase.client
      .from('team_profiles')
      .update({ sort_order: orderB })
      .eq('id', b.id);

    if (errorB) {
      throw toUserError(errorB);
    }
  }

  async canManage(eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('can_manage_profiles', {
      p_event_id: eventId,
    });

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return Boolean(data);
  }
}
