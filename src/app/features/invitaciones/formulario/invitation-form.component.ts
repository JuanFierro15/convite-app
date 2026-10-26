import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
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
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonReorder,
  IonReorderGroup,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ReorderEndCustomEvent,
  SegmentCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, personAddOutline, trashOutline } from 'ionicons/icons';
import {
  InvitationGuestInput,
  InvitationInput,
  InvitationKind,
  InvitationWithGuests,
  InvitationsRepository,
  PhoneStatus,
  caretForDigits,
  countDigitsBefore,
  formatPhone,
  newId,
  parsePhoneInput,
  toInvitationKind,
} from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';

interface GuestControlMap {
  id: FormControl<string>;
  full_name: FormControl<string>;
}

type GuestFormGroup = FormGroup<GuestControlMap>;

function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return value.trim().length > 0 ? null : { required: true };
}

function phoneValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  const result = parsePhoneInput(value);
  if (result.status === 'empty' || result.status === 'valid') {
    return null;
  }
  return { phone: result.message };
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
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
})
export class InvitationFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly invitationActions = inject(InvitationActionsService);

  @Input() eventId = '';
  @Input() invitation?: InvitationWithGuests;

  readonly isEdit = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);
  readonly kind = signal<InvitationKind>('group');
  readonly phoneStatus = signal<PhoneStatus>('empty');
  readonly duplicatePhoneWarning = signal<string | null>(null);

  private invitationId = '';
  private duplicatePhoneTimer: ReturnType<typeof setTimeout> | null = null;
  private duplicateCheckSequence = 0;

  readonly isSaveDisabled = computed(() => {
    if (this.saving()) {
      return true;
    }
    const status = this.phoneStatus();
    return status !== 'empty' && status !== 'valid';
  });

  readonly form = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<InvitationKind>('group'),
    group_name: ['', [Validators.required, Validators.maxLength(120), notBlankValidator]],
    phone: ['', [phoneValidator]],
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
      this.invitationId = existing.id;
      const initialKind = toInvitationKind(existing.kind);
      this.kind.set(initialKind);
      this.form.controls.kind.setValue(initialKind);
      this.form.controls.group_name.setValue(existing.group_name);

      const formatted = formatPhone(existing.phone);
      this.form.controls.phone.setValue(formatted);
      const parsed = parsePhoneInput(formatted);
      this.phoneStatus.set(parsed.status);
      if (parsed.status === 'valid' && parsed.e164) {
        this.scheduleDuplicatePhoneCheck(parsed.e164);
      }

      this.guestsArray.clear();
      if (existing.guests.length > 0) {
        for (const guest of existing.guests) {
          this.guestsArray.push(this.createGuestControl(guest.full_name, guest.id));
        }
      } else {
        this.guestsArray.push(this.createGuestControl(''));
      }

      if (initialKind === 'individual') {
        this.guestsArray.disable();
      }
    } else {
      this.isEdit.set(false);
      this.invitationId = newId();
      this.kind.set('group');
      this.form.controls.kind.setValue('group');
      this.phoneStatus.set('empty');
      this.guestsArray.clear();
      this.guestsArray.push(this.createGuestControl(''));
    }
  }

  ngOnDestroy(): void {
    if (this.duplicatePhoneTimer) {
      clearTimeout(this.duplicatePhoneTimer);
      this.duplicatePhoneTimer = null;
    }
  }

  onKindChange(event: SegmentCustomEvent): void {
    const nextKind = toInvitationKind(event.detail.value);
    this.setKind(nextKind);
  }

  setKind(nextKind: InvitationKind): void {
    const currentKind = this.kind();
    if (currentKind === nextKind) {
      return;
    }

    if (nextKind === 'individual') {
      const currentName = this.form.controls.group_name.value.trim();
      const namedGuests = this.guestsArray.controls.filter(
        (c) => c.controls.full_name.value.trim().length > 0,
      );
      if (currentName === '' && namedGuests.length === 1) {
        this.form.controls.group_name.setValue(
          namedGuests[0].controls.full_name.value.trim(),
        );
      }
      this.guestsArray.disable();
    } else {
      this.guestsArray.enable();
      const currentName = this.form.controls.group_name.value.trim();
      if (this.guestsArray.length === 0) {
        this.guestsArray.push(this.createGuestControl(currentName));
      } else if (
        this.guestsArray.length === 1 &&
        this.guestsArray.at(0).controls.full_name.value.trim() === ''
      ) {
        this.guestsArray.at(0).controls.full_name.setValue(currentName);
      }
    }

    this.kind.set(nextKind);
    this.form.controls.kind.setValue(nextKind);
  }

  async onPhoneInput(ionInput: IonInput): Promise<void> {
    this.duplicatePhoneWarning.set(null);
    if (this.duplicatePhoneTimer) {
      clearTimeout(this.duplicatePhoneTimer);
      this.duplicatePhoneTimer = null;
    }

    const nativeInput = await ionInput.getInputElement();
    const raw = nativeInput ? nativeInput.value : String(ionInput.value ?? '');
    const caret = nativeInput?.selectionStart ?? raw.length;

    const result = parsePhoneInput(raw);
    this.phoneStatus.set(result.status);

    this.form.controls.phone.setValue(result.display);

    const digitsBefore = countDigitsBefore(raw, caret);
    const nextCaret = caretForDigits(result.display, digitsBefore);

    setTimeout(() => {
      if (nativeInput) {
        if (nativeInput.value !== result.display) {
          nativeInput.value = result.display;
        }
        nativeInput.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);

    if (result.status === 'valid' && result.e164) {
      this.scheduleDuplicatePhoneCheck(result.e164);
    }
  }

  onPhoneBlur(): void {
    this.form.controls.phone.markAsTouched();
  }

  private scheduleDuplicatePhoneCheck(e164: string): void {
    if (this.duplicatePhoneTimer) {
      clearTimeout(this.duplicatePhoneTimer);
    }

    const sequence = ++this.duplicateCheckSequence;

    this.duplicatePhoneTimer = setTimeout(async () => {
      const currentParsed = parsePhoneInput(this.form.controls.phone.value);
      if (
        currentParsed.status !== 'valid' ||
        currentParsed.e164 !== e164 ||
        sequence !== this.duplicateCheckSequence
      ) {
        return;
      }

      const targetEventId = this.invitation ? this.invitation.event_id : this.eventId;
      const currentInvId = this.invitation ? this.invitation.id : undefined;

      try {
        const names = await this.invitationsRepository.findPhoneInEvent(
          targetEventId,
          e164,
          currentInvId,
        );

        const latestParsed = parsePhoneInput(this.form.controls.phone.value);
        if (
          latestParsed.status !== 'valid' ||
          latestParsed.e164 !== e164 ||
          sequence !== this.duplicateCheckSequence
        ) {
          return;
        }

        if (names.length > 0) {
          this.duplicatePhoneWarning.set(
            `Este número ya está en la invitación de ${names.join(', ')}.`,
          );
        } else {
          this.duplicatePhoneWarning.set(null);
        }
      } catch {
        this.duplicatePhoneWarning.set(null);
      }
    }, 400);
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
      return this.kind() === 'individual'
        ? 'El nombre no puede superar 120 caracteres.'
        : 'El nombre del grupo no puede superar 120 caracteres.';
    }
    return this.kind() === 'individual'
      ? 'Escribe el nombre de la persona.'
      : 'Escribe el nombre del grupo.';
  }

  showPhoneError(): boolean {
    const status = this.phoneStatus();
    if (status === 'empty' || status === 'valid') {
      return false;
    }
    if (status === 'incomplete') {
      const control = this.form.controls.phone;
      return control.touched || this.submitted();
    }
    return true;
  }

  phoneErrorText(): string {
    const result = parsePhoneInput(this.form.controls.phone.value);
    return result.message ?? '';
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
    if (this.kind() === 'group') {
      this.guestsArray.updateValueAndValidity();
    }

    if (this.form.invalid || this.isSaveDisabled()) {
      return;
    }

    const raw = this.form.getRawValue();
    const currentKind = this.kind();

    let guestsPayload: InvitationGuestInput[];

    if (currentKind === 'individual') {
      const namedGuests = this.guestsArray.controls.filter(
        (c) => c.controls.full_name.value.trim().length > 0,
      );

      if (namedGuests.length > 1) {
        const alert = await this.alertController.create({
          header: 'Invitación individual',
          message: `Esta invitación tiene ${namedGuests.length} personas. Como invitación individual quedará solo ${raw.group_name.trim()}. ¿Continuar?`,
          buttons: [
            {
              text: 'Cancelar',
              role: 'cancel',
            },
            {
              text: 'Continuar',
              role: 'confirm',
            },
          ],
        });

        await alert.present();
        const { role } = await alert.onDidDismiss();
        if (role !== 'confirm') {
          return;
        }
      }

      let firstGuestId = this.guestsArray.at(0)?.controls.id.value;
      if (!firstGuestId) {
        firstGuestId = newId();
        this.guestsArray.push(this.createGuestControl('', firstGuestId));
      }

      guestsPayload = [
        {
          id: firstGuestId,
          full_name: raw.group_name.trim(),
        },
      ];
    } else {
      guestsPayload = raw.guests.map((guest) => ({
        id: guest.id,
        full_name: guest.full_name.trim(),
      }));
    }

    this.saving.set(true);
    const payload: InvitationInput = {
      kind: currentKind,
      group_name: raw.group_name.trim(),
      phone: raw.phone.trim() ? raw.phone : null,
      guests: guestsPayload,
    };

    const targetEventId = this.invitation ? this.invitation.event_id : this.eventId;

    try {
      const saved = await this.invitationsRepository.save(
        targetEventId,
        this.invitationId,
        payload,
      );
      await this.modalController.dismiss(saved, 'saved');
    } catch (err) {
      await this.invitationActions.showError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private createGuestControl(fullName: string, id: string = newId()): GuestFormGroup {
    return this.fb.group<GuestControlMap>({
      id: this.fb.nonNullable.control(id),
      full_name: this.fb.nonNullable.control(fullName, [
        Validators.required,
        Validators.maxLength(120),
        notBlankValidator,
      ]),
    });
  }
}
