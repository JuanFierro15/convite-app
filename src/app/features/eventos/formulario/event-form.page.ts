import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import {
  DEFAULT_THEME,
  EventContextService,
  EventInput,
  EventsRepository,
  ThemeId,
  ThemeService,
  endOfDayBogota,
  fromBogotaDateTimeInput,
  themeOptionsFor,
  toBogotaDateInput,
  toBogotaDateTimeInput,
} from '../../../core';
import { EmptyStateComponent, ThemePickerComponent } from '../../../shared';

function requiredTrimmedValidator(
  control: AbstractControl<string>,
): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return value.length > 0 ? null : { required: true };
}

function httpsUrlValidator(
  control: AbstractControl<string>,
): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return value.startsWith('https://') ? null : { httpsUrl: true };
}

function nonNegativeIntegerValidator(
  control: AbstractControl<string | number | null>,
): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return { nonNegativeInteger: true };
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { nonNegativeInteger: true };
  }
  return null;
}

function rsvpDeadlineValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const startsAtRaw = String(group.get('starts_at')?.value ?? '').trim();
  const deadlineRaw = String(group.get('rsvp_deadline')?.value ?? '').trim();

  if (!startsAtTrimmedOrValid(startsAtRaw) || !startsAtTrimmedOrValid(deadlineRaw)) {
    return null;
  }

  const startsAtMs = new Date(fromBogotaDateTimeInput(startsAtRaw)).getTime();
  const deadlineMs = new Date(endOfDayBogota(deadlineRaw)).getTime();

  if (Number.isNaN(startsAtMs) || Number.isNaN(deadlineMs)) {
    return null;
  }

  return deadlineMs <= startsAtMs ? null : { deadlineAfterStart: true };
}

function startsAtTrimmedOrValid(value: string): boolean {
  return value.length > 0;
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableBudget(value: string | number | null | undefined): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

@Component({
  selector: 'app-event-form',
  templateUrl: 'event-form.page.html',
  styleUrls: ['event-form.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonButton,
    EmptyStateComponent,
    ThemePickerComponent,
  ],
})
export class EventFormPage implements ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly eventContext = inject(EventContextService);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>();

  private readonly loadedTheme = signal<ThemeId | null>(null);
  readonly themeOptions = computed(() => themeOptionsFor(this.loadedTheme()));
  readonly loading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal<boolean>(false);

  readonly isEditMode = computed<boolean>(() => Boolean(this.id()));

  readonly pageTitle = computed<string>(() =>
    this.isEditMode() ? 'Editar evento' : 'Nuevo evento',
  );

  readonly backHref = computed<string>(() => {
    const eventId = this.id();
    return eventId ? `/eventos/${eventId}/panel` : '/eventos';
  });

  readonly submitLabel = computed<string>(() =>
    this.isEditMode() ? 'Guardar cambios' : 'Crear evento',
  );

  readonly form = this.fb.nonNullable.group(
    {
      name: ['', [requiredTrimmedValidator, Validators.maxLength(120)]],
      theme_id: [DEFAULT_THEME as string, [Validators.required]],
      starts_at: ['', [requiredTrimmedValidator]],
      venue_name: ['', [Validators.maxLength(120)]],
      venue_address: ['', [Validators.maxLength(120)]],
      city: ['', [Validators.maxLength(120)]],
      map_url: ['', [httpsUrlValidator]],
      welcome_message: ['', [Validators.maxLength(500)]],
      rsvp_deadline: ['', [requiredTrimmedValidator]],
      budget_cop: ['', [nonNegativeIntegerValidator]],
    },
    { validators: [rsvpDeadlineValidator] },
  );

  constructor() {
    this.form.controls.theme_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((themeId) => {
        this.themeService.apply(themeId);
      });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    if (!eventId) {
      this.resetForCreate();
      return;
    }
    void this.loadForEdit(eventId);
  }

  retryLoad(): void {
    const eventId = this.id();
    if (eventId) {
      void this.loadForEdit(eventId);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const payload: EventInput = {
      name: raw.name.trim(),
      theme_id: raw.theme_id,
      starts_at: fromBogotaDateTimeInput(raw.starts_at),
      venue_name: toNullableText(raw.venue_name),
      venue_address: toNullableText(raw.venue_address),
      city: toNullableText(raw.city),
      map_url: toNullableText(raw.map_url),
      welcome_message: toNullableText(raw.welcome_message),
      rsvp_deadline: endOfDayBogota(raw.rsvp_deadline),
      budget_cop: toNullableBudget(raw.budget_cop),
    };

    try {
      const eventId = this.id();
      if (eventId) {
        await this.eventsRepo.update(eventId, payload);
        await this.eventContext.load(eventId, { force: true });
        await this.router.navigate(['/eventos', eventId, 'panel'], {
          replaceUrl: true,
        });
      } else {
        const created = await this.eventsRepo.create(payload);
        await this.router.navigate(['/eventos', created.id, 'panel'], {
          replaceUrl: true,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos guardar el cambio. Inténtalo de nuevo.';
      await this.showErrorToast(message);
    } finally {
      this.submitting.set(false);
    }
  }

  private resetForCreate(): void {
    this.loadedTheme.set(null);
    this.loading.set(false);
    this.loadError.set(null);
    this.form.reset({
      name: '',
      theme_id: DEFAULT_THEME,
      starts_at: '',
      venue_name: '',
      venue_address: '',
      city: '',
      map_url: '',
      welcome_message: '',
      rsvp_deadline: '',
      budget_cop: '',
    });
    this.themeService.apply(DEFAULT_THEME);
  }

  private async loadForEdit(eventId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await this.eventContext.load(eventId, { force: true });
      const contextError = this.eventContext.error();
      if (contextError) {
        this.loadError.set(contextError);
        return;
      }

      const currentEvent = this.eventContext.event();
      const currentRole = this.eventContext.role();

      if (currentRole !== 'owner' || !currentEvent) {
        await this.showErrorToast('Solo los propietarios pueden editar el evento.');
        await this.router.navigate(['/eventos', eventId, 'panel'], {
          replaceUrl: true,
        });
        return;
      }

      const resolvedTheme: ThemeId = this.themeService.apply(
        currentEvent.theme_id,
      );
      this.loadedTheme.set(resolvedTheme);

      this.form.reset({
        name: currentEvent.name,
        theme_id: resolvedTheme,
        starts_at: toBogotaDateTimeInput(currentEvent.starts_at),
        venue_name: currentEvent.venue_name ?? '',
        venue_address: currentEvent.venue_address ?? '',
        city: currentEvent.city ?? '',
        map_url: currentEvent.map_url ?? '',
        welcome_message: currentEvent.welcome_message ?? '',
        rsvp_deadline: toBogotaDateInput(currentEvent.rsvp_deadline),
        budget_cop:
          currentEvent.budget_cop !== null &&
          currentEvent.budget_cop !== undefined
            ? String(currentEvent.budget_cop)
            : '',
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar los datos del evento.';
      this.loadError.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  private async showErrorToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}
