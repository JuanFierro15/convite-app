import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

export interface LastKnownUser {
  id: string;
  email: string;
  displayName: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos.';
const GENERIC_SIGN_IN_ERROR_MESSAGE =
  'No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly sessionSignal = signal<Session | null>(null);
  private readonly readySignal = signal<boolean>(false);

  readonly session = this.sessionSignal.asReadonly();
  readonly ready = this.readySignal.asReadonly();

  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);

  readonly displayName = computed<string>(() => {
    const currentUser = this.user();
    if (!currentUser) {
      return '';
    }

    const metaName = currentUser.user_metadata?.['display_name'];
    if (typeof metaName === 'string' && metaName.trim().length > 0) {
      return metaName.trim();
    }

    const email = currentUser.email ?? '';
    const atIndex = email.indexOf('@');
    return atIndex > 0 ? email.slice(0, atIndex) : email;
  });

  constructor() {
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSignal.set(session);
      this.readySignal.set(true);
      if (session) {
        this.saveLastUser(session);
      }
    });

    void this.supabase.client.auth
      .getSession()
      .then(({ data }) => {
        this.sessionSignal.set(data.session ?? null);
        if (data.session) {
          this.saveLastUser(data.session);
        }
      })
      .catch(() => {
        this.sessionSignal.set(null);
      })
      .finally(() => {
        this.readySignal.set(true);
      });
  }

  async signIn(email: string, password: string): Promise<void> {
    let result;
    try {
      result = await this.supabase.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
    } catch {
      throw new Error(GENERIC_SIGN_IN_ERROR_MESSAGE);
    }

    const { data, error } = result;
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      const code = (error as { code?: string }).code ?? '';
      if (
        code === 'invalid_credentials' ||
        msg.includes('invalid login credentials') ||
        msg.includes('invalid_credentials')
      ) {
        throw new Error(INVALID_CREDENTIALS_MESSAGE);
      }
      throw new Error(GENERIC_SIGN_IN_ERROR_MESSAGE);
    }

    this.sessionSignal.set(data.session);
    this.readySignal.set(true);
    if (data.session) {
      this.saveLastUser(data.session);
    }
  }

  async signOut(): Promise<void> {
    void Preferences.remove({ key: 'convite.lastUser' }).catch(() => {});
    await this.supabase.client.auth.signOut();
    this.sessionSignal.set(null);
  }

  async lastKnownUser(): Promise<LastKnownUser | null> {
    try {
      const { value } = await Preferences.get({ key: 'convite.lastUser' });
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value) as Partial<LastKnownUser>;
      if (
        typeof parsed?.id === 'string' &&
        typeof parsed?.email === 'string' &&
        typeof parsed?.displayName === 'string'
      ) {
        return {
          id: parsed.id,
          email: parsed.email,
          displayName: parsed.displayName,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async tryRestoreSession(): Promise<boolean> {
    if (this.sessionSignal()) {
      return true;
    }
    const lastUser = await this.lastKnownUser();
    if (!lastUser) {
      return false;
    }
    try {
      const { data, error } = await this.supabase.client.auth.refreshSession();
      if (error || !data.session) {
        return false;
      }
      this.sessionSignal.set(data.session);
      this.readySignal.set(true);
      this.saveLastUser(data.session);
      return true;
    } catch {
      return false;
    }
  }

  private saveLastUser(session: Session): void {
    try {
      const currentUser = session.user;
      if (!currentUser) {
        return;
      }
      const metaName = currentUser.user_metadata?.['display_name'];
      let displayName = '';
      if (typeof metaName === 'string' && metaName.trim().length > 0) {
        displayName = metaName.trim();
      } else {
        const email = currentUser.email ?? '';
        const atIndex = email.indexOf('@');
        displayName = atIndex > 0 ? email.slice(0, atIndex) : email;
      }

      const payload: LastKnownUser = {
        id: currentUser.id,
        email: currentUser.email ?? '',
        displayName,
      };

      void Preferences.set({
        key: 'convite.lastUser',
        value: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // Ignorar errores al guardar el último usuario en Preferences
    }
  }
}
