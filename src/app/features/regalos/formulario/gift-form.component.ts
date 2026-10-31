import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { GiftInput, GiftKind, GiftWithReservations, GiftsRepository } from '../../../core';

function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return value.trim().length === 0 ? { required: true } : null;
}

function toGiftKind(value: string): GiftKind {
  if (
    value === 'repeatable' ||
    value === 'free' ||
    value === 'suggestion' ||
    value === 'envelope'
  ) {
    return value;
  }
  return 'unique';
}

@Component({
  selector: 'app-gift-form',
  standalone: true,
  templateUrl: './gift-form.component.html',
  styleUrls: ['./gift-form.component.scss'],
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
    IonInput,
    IonTextarea,
    IonRadioGroup,
    IonRadio,
    IonSpinner,
  ],
})
export class GiftFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly giftsRepo = inject(GiftsRepository);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  private readonly eventIdSignal = signal<string>('');
  private readonly giftSignal = signal<GiftWithReservations | null>(null);
  private readonly hasFreeGiftSignal = signal<boolean>(false);
  private readonly hasEnvelopeGiftSignal = signal<boolean>(false);

  @Input({ required: true })
  set eventId(value: string) {
    this.eventIdSignal.set(value);
  }
  get eventId(): string {
    return this.eventIdSignal();
  }

  @Input()
  set gift(value: GiftWithReservations | null | undefined) {
    this.giftSignal.set(value ?? null);
  }
  get gift(): GiftWithReservations | null {
    return this.giftSignal();
  }

  @Input()
  set hasFreeGift(value: boolean) {
    this.hasFreeGiftSignal.set(Boolean(value));
  }
  get hasFreeGift(): boolean {
    return this.hasFreeGiftSignal();
  }

  @Input()
  set hasEnvelopeGift(value: boolean) {
    this.hasEnvelopeGiftSignal.set(Boolean(value));
  }
  get hasEnvelopeGift(): boolean {
    return this.hasEnvelopeGiftSignal();
  }

  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);

  readonly isEditing = computed<boolean>(() => this.giftSignal() !== null);

  readonly isTypeLocked = computed<boolean>(() => {
    const current = this.giftSignal();
    return current !== null && current.reservations.length > 0;
  });

  readonly showEnvelopeOption = computed<boolean>(() => {
    const current = this.giftSignal();
    if (current?.kind === 'envelope') {
      return true;
    }
    return !this.hasEnvelopeGiftSignal();
  });

  readonly envelopeOptionDisabled = computed<boolean>(() => !this.showEnvelopeOption());

  readonly showFreeOption = computed<boolean>(() => {
    const current = this.giftSignal();
    if (current?.kind === 'free') {
      return true;
    }
    return !this.hasFreeGiftSignal();
  });

  readonly freeOptionDisabled = computed<boolean>(() => !this.showFreeOption());

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlankValidator, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(300)]],
    category: ['', [Validators.maxLength(60)]],
    kind: ['unique' as GiftKind, [Validators.required]],
    maxReservations: [''],
  });

  readonly selectedKind = toSignal(this.form.controls.kind.valueChanges, {
    initialValue: this.form.controls.kind.value,
  });

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    const current = this.giftSignal();
    if (current) {
      this.form.patchValue({
        name: current.name,
        description: current.description ?? '',
        category: current.category ?? '',
        kind: toGiftKind(current.kind),
        maxReservations:
          current.kind === 'repeatable' &&
          current.max_reservations !== null &&
          current.max_reservations !== undefined
            ? String(current.max_reservations)
            : '',
      });
      if (this.isTypeLocked()) {
        this.form.controls.kind.disable();
      }
    }
  }

  get nameError(): string | null {
    const ctrl = this.form.controls.name;
    if (!ctrl.invalid || (!ctrl.touched && !this.submitted())) {
      return null;
    }
    if (ctrl.hasError('maxlength')) {
      return 'El nombre puede tener máximo 120 caracteres.';
    }
    return 'Escribe el nombre del regalo.';
  }

  get maxReservationsError(): string | null {
    const ctrl = this.form.controls.maxReservations;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    return this.getMaxReservationsValidationMessage();
  }

  private getMaxReservationsValidationMessage(): string | null {
    const rawKind = this.form.controls.kind.value;
    const current = this.giftSignal();
    const resolvedKind = this.isTypeLocked() && current ? toGiftKind(current.kind) : rawKind;

    if (resolvedKind !== 'repeatable') {
      return null;
    }

    const value = this.form.controls.maxReservations.value ?? '';
    const trimmed = value.trim();
    if (trimmed === '') {
      return 'Escribe cuántas familias pueden elegirlo (2 o más).';
    }

    if (!/^[1-9]\d*$/.test(trimmed)) {
      return 'Escribe un número entero de 2 en adelante.';
    }

    if (trimmed === '1') {
      return 'Si solo una familia puede elegirlo, usa Único.';
    }

    const num = Number(trimmed);
    const reservationsCount = current?.reservations.length ?? 0;
    if (current && num < reservationsCount) {
      const familyWord = reservationsCount === 1 ? '1 familia' : `${reservationsCount} familias`;
      return `Ya hay ${familyWord} con este regalo. El límite no puede ser menor.`;
    }

    return null;
  }

  get descriptionError(): string | null {
    const ctrl = this.form.controls.description;
    if (!ctrl.invalid || (!ctrl.touched && !this.submitted())) {
      return null;
    }
    if (ctrl.hasError('maxlength')) {
      return 'La descripción puede tener máximo 300 caracteres.';
    }
    return null;
  }

  get categoryError(): string | null {
    if (this.selectedKind() === 'envelope') {
      return null;
    }
    const ctrl = this.form.controls.category;
    if (!ctrl.invalid || (!ctrl.touched && !this.submitted())) {
      return null;
    }
    if (ctrl.hasError('maxlength')) {
      return 'La categoría puede tener máximo 60 caracteres.';
    }
    return null;
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.maxReservationsError !== null || this.saving()) {
      return;
    }

    const raw = this.form.getRawValue();
    const current = this.giftSignal();
    const resolvedKind: GiftKind =
      this.isTypeLocked() && current ? toGiftKind(current.kind) : raw.kind;

    if (resolvedKind === 'envelope' && this.envelopeOptionDisabled()) {
      await this.showErrorToast('El evento ya tiene una lluvia de sobres.');
      return;
    }

    if (resolvedKind === 'free' && this.freeOptionDisabled()) {
      await this.showErrorToast('El evento ya tiene un regalo libre.');
      return;
    }

    let parsedMaxReservations: number | null = null;
    if (resolvedKind === 'repeatable') {
      parsedMaxReservations = Number(raw.maxReservations.trim());
    }

    const input: GiftInput = {
      name: raw.name.trim(),
      description: raw.description.trim() ? raw.description.trim() : null,
      category:
        resolvedKind === 'envelope'
          ? null
          : raw.category.trim()
            ? raw.category.trim()
            : null,
      kind: resolvedKind,
      max_reservations: parsedMaxReservations,
    };

    this.saving.set(true);
    try {
      const saved = current
        ? await this.giftsRepo.update(current.id, input)
        : await this.giftsRepo.create(this.eventIdSignal(), input);
      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No pudimos guardar el regalo.';
      await this.showErrorToast(message);
    } finally {
      this.saving.set(false);
    }
  }

  private async showErrorToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'danger',
    });
    await toast.present();
  }
}
