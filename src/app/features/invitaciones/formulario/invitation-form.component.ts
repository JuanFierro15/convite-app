import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
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
  IonList,
  IonReorder,
  IonReorderGroup,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ReorderEndCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, personAddOutline, trashOutline } from 'ionicons/icons';
import {
  InvitationInput,
  InvitationWithGuests,
  InvitationsRepository,
  formatPhone,
  isValidPhone,
} from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';

interface GuestControlMap {
  id: FormControl<string | undefined>;
  full_name: FormControl<string>;
}

type GuestFormGroup = FormGroup<GuestControlMap>;

function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return value.trim().length > 0 ? null : { required: true };
}

function optionalPhoneValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  if (value.trim() === '') {
    return null;
  }
  return isValidPhone(value) ? null : { invalidPhone: true };
}

function minOneGuestValidator(control: AbstractControl): ValidationErrors | null {
  const array = control as FormArray<GuestFormGroup>;
  return array.length >= 1 ? null : { minGuests: true };
}

@Component({
  selector: 'app-invitation-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitation-form.component.html',
  styleUrls: ['./invitation-form.component.scss'],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonInput,
    IonList,
    IonItem,
    IonIcon,
    IonReorderGroup,
    IonReorder,
    IonSpinner,
  ],
})
export class InvitationFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly modalController = inject(ModalController);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly invitationActions = inject(InvitationActionsService);

  @Input() eventId = '';
  @Input() invitation?: InvitationWithGuests;

  readonly isEdit = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);

  readonly form = this.fb.nonNullable.group({
    group_name: ['', [Validators.required, Validators.maxLength(120), notBlankValidator]],
    phone: ['', [optionalPhoneValidator]],
    guests: this.fb.array<GuestFormGroup>([], [minOneGuestValidator]),
  });

  constructor() {
    addIcons({ personAddOutline, trashOutline, closeOutline });
  }

  get guestsArray(): FormArray<GuestFormGroup> {
    return this.form.controls.guests;
  }

  ngOnInit(): void {
    const existing = this.invitation;
    if (existing) {
      this.isEdit.set(true);
      this.form.controls.group_name.setValue(existing.group_name);
      this.form.controls.phone.setValue(formatPhone(existing.phone));
      this.guestsArray.clear();
      if (existing.guests.length > 0) {
        for (const guest of existing.guests) {
          this.guestsArray.push(this.createGuestControl(guest.full_name, guest.id));
        }
      } else {
        this.guestsArray.push(this.createGuestControl(''));
      }
    } else {
      this.isEdit.set(false);
      this.guestsArray.clear();
      this.guestsArray.push(this.createGuestControl(''));
    }
  }

  addGuest(): void {
    this.guestsArray.push(this.createGuestControl(''));
    this.guestsArray.markAsDirty();
    this.guestsArray.updateValueAndValidity();
  }

  removeGuest(index: number): void {
    if (index < 0 || index >= this.guestsArray.length) {
      return;
    }
    this.guestsArray.removeAt(index);
    this.guestsArray.markAsTouched();
    this.guestsArray.markAsDirty();
    this.guestsArray.updateValueAndValidity();
  }

  onReorder(event: ReorderEndCustomEvent): void {
    const { from, to } = event.detail;
    if (
      from !== to &&
      from >= 0 &&
      to >= 0 &&
      from < this.guestsArray.length &&
      to < this.guestsArray.length
    ) {
      const moved = this.guestsArray.at(from);
      this.guestsArray.removeAt(from);
      this.guestsArray.insert(to, moved);
      this.guestsArray.markAsDirty();
    }
    event.detail.complete(false);
  }

  removeGuestAriaLabel(index: number): string {
    const rawName = this.guestsArray.at(index)?.controls.full_name.value?.trim() ?? '';
    return rawName ? `Quitar a ${rawName}` : `Quitar a persona ${index + 1}`;
  }

  showGroupNameError(): boolean {
    const control = this.form.controls.group_name;
    return control.invalid && (control.touched || this.submitted());
  }

  groupNameErrorText(): string {
    const errors = this.form.controls.group_name.errors;
    if (errors?.['maxlength']) {
      return 'El nombre del grupo no puede superar 120 caracteres.';
    }
    return 'Escribe el nombre del grupo.';
  }

  showPhoneError(): boolean {
    const control = this.form.controls.phone;
    return control.invalid && (control.touched || this.submitted());
  }

  showGuestsMinError(): boolean {
    return (
      Boolean(this.guestsArray.errors?.['minGuests']) &&
      (this.guestsArray.touched || this.submitted())
    );
  }

  showGuestNameError(index: number): boolean {
    const control = this.guestsArray.at(index)?.controls.full_name;
    if (!control) {
      return false;
    }
    return control.invalid && (control.touched || this.submitted());
  }

  guestNameErrorText(index: number): string {
    const errors = this.guestsArray.at(index)?.controls.full_name.errors;
    if (errors?.['maxlength']) {
      return 'El nombre no puede superar 120 caracteres.';
    }
    return 'Escribe el nombre de la persona.';
  }

  async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.guestsArray.updateValueAndValidity();

    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload: InvitationInput = {
      group_name: raw.group_name.trim(),
      phone: raw.phone,
      guests: raw.guests.map((guest) =>
        guest.id
          ? { id: guest.id, full_name: guest.full_name.trim() }
          : { full_name: guest.full_name.trim() },
      ),
    };

    try {
      const existing = this.invitation;
      const saved = existing
        ? await this.invitationsRepository.update(existing.id, payload)
        : await this.invitationsRepository.create(this.eventId, payload);
      await this.modalController.dismiss(saved, 'saved');
    } catch (err) {
      await this.invitationActions.showError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private createGuestControl(fullName: string, id?: string): GuestFormGroup {
    return this.fb.group<GuestControlMap>({
      id: this.fb.nonNullable.control<string | undefined>(id),
      full_name: this.fb.nonNullable.control(fullName, [
        Validators.required,
        Validators.maxLength(120),
        notBlankValidator,
      ]),
    });
  }
}
