import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { ConnectionStatusService } from './connection-status.service';
import { Database } from './database.types';
import { createResilientFetch } from './resilient-fetch';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly connectionStatus = inject(ConnectionStatusService);

  readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: createResilientFetch(this.connectionStatus),
      },
    },
  );
}
