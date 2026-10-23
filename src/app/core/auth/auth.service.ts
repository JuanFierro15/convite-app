import { Injectable, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

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
    });

    void this.supabase.client.auth
      .getSession()
      .then(({ data }) => {
        this.sessionSignal.set(data.session ?? null);
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
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.sessionSignal.set(null);
  }
}
