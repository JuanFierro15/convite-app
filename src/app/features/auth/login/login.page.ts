import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonSpinner,
  IonText,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  eye,
  eyeOff,
  eyeOffOutline,
  eyeOutline,
  lockClosedOutline,
  mailOutline,
  qrCodeOutline,
} from 'ionicons/icons';
import { filter, firstValueFrom } from 'rxjs';
import {
  APP_ICON_THEME,
  ArrivalSnapshot,
  ArrivalStoreService,
  AuthService,
  ThemeService,
  formatDownloadedAt,
} from '../../../core';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonCard,
    IonCardContent,
    IonInput,
    IonInputPasswordToggle,
    IonIcon,
    IonButton,
    IonSpinner,
    IonText,
  ],
})
export class LoginPage implements ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly store = inject(ArrivalStoreService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly authReady$ = toObservable(this.auth.ready);

  readonly submitting = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly offlineSnapshots = signal<ArrivalSnapshot[]>([]);

  readonly logoSrc = computed<string>(() => this.theme.asset(APP_ICON_THEME, 'app-icon.png'));

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eye,
      eyeOff,
      eyeOutline,
      eyeOffOutline,
      qrCodeOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.theme.apply(null);
    this.errorMessage.set(null);
    this.offlineSnapshots.set([]);

    if (!this.auth.ready()) {
      await firstValueFrom(this.authReady$.pipe(filter((ready) => ready)));
    }

    if (this.auth.session()) {
      await this.router.navigateByUrl('/eventos', { replaceUrl: true });
      return;
    }

    const last = await this.auth.lastKnownUser();
    const snapshots = (await this.store.listSnapshots()).filter(
      (s) => s.userId === last?.id,
    );
    this.offlineSnapshots.set(snapshots);
  }

  formatDownloadedAt(iso: string): string {
    return formatDownloadedAt(iso);
  }

  get emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.invalid || (!control.touched && !this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Escribe tu correo.';
    }
    if (control.hasError('email')) {
      return 'Revisa el formato del correo.';
    }
    return null;
  }

  get passwordError(): string | null {
    const control = this.form.controls.password;
    if (!control.invalid || (!control.touched && !this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Escribe tu contraseña.';
    }
    return null;
  }

  onPasswordEnter(event: Event): void {
    event.preventDefault();
    void this.onSubmit();
  }

  async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);

    try {
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl('/eventos', { replaceUrl: true });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.';
      this.errorMessage.set(message);
    } finally {
      this.submitting.set(false);
    }
  }
}
