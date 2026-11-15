import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import {
  EventContextService,
  InvitationBatchInput,
  InvitationBatchRow,
  InvitationBatchesRepository,
  endOfDayBogota,
  fromBogotaDateTimeInput,
  newId,
  toBogotaDateInput,
} from '../../../core';

function requiredTrimmedValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return value.length > 0 ? null : { required: true };
}

function suggestedBatchName(existingCount: number): string {
  if (existingCount === 0) {
    return 'Segunda tanda';
  }
  if (existingCount === 1) {
    return 'Tercera tanda';
  }
  return '';
}

@Component({
  selector: 'app-batch-form',
  standalone: true,
  templateUrl: './batch-form.component.html',
  styleUrls: ['./batch-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonItem,
    IonInput,
    IonSpinner,
  ],
})
export class BatchFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly batchesRepo = inject(InvitationBatchesRepository);
  private readonly eventContext = inject(EventContextService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  // Generado una sola vez al abrir el modal para que reintentar tras un fallo de red no duplique.
  private readonly creationId = newId();
  private readonly batchSignal = signal<InvitationBatchRow | undefined>(undefined);

  @Input() eventId = '';
  @Input()
  set batch(value: InvitationBatchRow | undefined) {
    this.batchSignal.set(value);
  }
  get batch(): InvitationBatchRow | undefined {
    return this.batchSignal();
  }
  @Input() eventStartsAt = '';
  @Input() existingBatchCount?: number;

  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);

  readonly isEditing = computed<boolean>(() => Boolean(this.batchSignal()));

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmedValidator, Validators.maxLength(60)]],
    rsvp_deadline: [
      '',
      [
        requiredTrimmedValidator,
        (control: AbstractControl<string>): ValidationErrors | null =>
          this.validateDeadlineBeforeStart(control),
      ],
    ],
  });

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    const current = this.batchSignal();
    if (current) {
      this.form.reset({
        name: current.name,
        rsvp_deadline: toBogotaDateInput(current.rsvp_deadline),
      });
    } else {
      const count = this.existingBatchCount ?? this.eventContext.batches().length;
      this.form.reset({
        name: suggestedBatchName(count),
        rsvp_deadline: '',
      });
    }
    this.form.controls.rsvp_deadline.updateValueAndValidity({ emitEvent: false });
  }

  get nameError(): string | null {
    const ctrl = this.form.controls.name;
    if (!ctrl.touched && !ctrl.dirty && !this.submitted()) {
      return null;
    }
    if (ctrl.hasError('required')) {
      return 'El nombre de la tanda es obligatorio.';
    }
    if (ctrl.hasError('maxlength')) {
      return 'El nombre no puede superar los 60 caracteres.';
    }
    return null;
  }

  get deadlineError(): string | null {
    const ctrl = this.form.controls.rsvp_deadline;
    if (!ctrl.touched && !ctrl.dirty && !this.submitted()) {
      return null;
    }
    if (ctrl.hasError('required')) {
      return 'La fecha límite es obligatoria.';
    }
    if (ctrl.hasError('deadlineAfterStart')) {
      return 'La fecha límite debe ser antes del día del evento.';
    }
    return null;
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.form.controls.rsvp_deadline.updateValueAndValidity({ emitEvent: false });

    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload: InvitationBatchInput = {
      name: raw.name.trim(),
      rsvp_deadline: endOfDayBogota(raw.rsvp_deadline),
    };

    try {
      const current = this.batchSignal();
      const saved = current
        ? await this.batchesRepo.update(current.id, payload)
        : await this.batchesRepo.create(this.eventId, this.creationId, payload);

      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos guardar el cambio. Inténtalo de nuevo.';
      await this.showErrorToast(message);
    } finally {
      this.saving.set(false);
    }
  }

  private validateDeadlineBeforeStart(
    control: AbstractControl<string>,
  ): ValidationErrors | null {
    const deadlineRaw = String(control.value ?? '').trim();
    const startsAtRaw = String(this.eventStartsAt ?? '').trim();

    if (!deadlineRaw || !startsAtRaw) {
      return null;
    }

    const startsAtMs = new Date(fromBogotaDateTimeInput(startsAtRaw)).getTime();
    const deadlineMs = new Date(endOfDayBogota(deadlineRaw)).getTime();

    if (Number.isNaN(startsAtMs) || Number.isNaN(deadlineMs)) {
      return null;
    }

    return deadlineMs <= startsAtMs ? null : { deadlineAfterStart: true };
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
