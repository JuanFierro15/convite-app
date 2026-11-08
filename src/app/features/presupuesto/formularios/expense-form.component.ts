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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import {
  BudgetRepository,
  ExpenseCategoryRow,
  ExpenseInput,
  ExpenseWithPayments,
  formatCopInput,
  newId,
  paidTotal,
  parseCopInput,
} from '../../../core';
import { CopInputDirective } from '../../../shared';
import { DiscardGuard } from '../../invitaciones/formulario/discard-guard';

function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return value.trim().length === 0 ? { required: true } : null;
}

@Component({
  selector: 'app-expense-form',
  standalone: true,
  templateUrl: './expense-form.component.html',
  styleUrls: ['./expense-form.component.scss'],
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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    CopInputDirective,
  ],
})
export class ExpenseFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private creationId = newId();

  @Input() eventId = '';
  @Input() expense: ExpenseWithPayments | null = null;
  @Input() categories: ExpenseCategoryRow[] = [];
  @Input() discardGuard?: DiscardGuard;

  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);

  readonly isEditing = computed<boolean>(() => this.expense !== null);

  readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120), notBlankValidator]],
    category_id: ['', [Validators.required]],
    amount_cop: ['', [Validators.required]],
    note: ['', [Validators.maxLength(500)]],
  });

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    if (this.expense) {
      this.form.reset({
        description: this.expense.description,
        category_id: this.expense.category_id,
        amount_cop: formatCopInput(String(this.expense.amount_cop)).value,
        note: this.expense.note ?? '',
      });
    } else {
      this.form.reset({
        description: '',
        category_id: '',
        amount_cop: '',
        note: '',
      });
    }

    if (this.discardGuard) {
      this.discardGuard.hasChanges = () => this.form.dirty;
    }
  }

  get descriptionError(): string | null {
    const ctrl = this.form.controls.description;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'La descripción es obligatoria.';
    }
    if (val.length > 120) {
      return 'La descripción puede tener máximo 120 caracteres.';
    }
    return null;
  }

  get categoryError(): string | null {
    const ctrl = this.form.controls.category_id;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'Elige una categoría.';
    }
    return null;
  }

  get amountError(): string | null {
    const ctrl = this.form.controls.amount_cop;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const raw = ctrl.value;
    const parsed = parseCopInput(raw ?? '');
    if (parsed === null) {
      return 'Escribe un monto en números enteros, sin decimales.';
    }
    if (parsed < 1 || parsed > 999_999_999) {
      return 'El monto debe estar entre $ 1 y $ 999.999.999.';
    }
    if (this.expense) {
      const paid = paidTotal(this.expense.payments ?? []);
      if (parsed < paid) {
        return 'El monto no puede ser menor que lo que ya se pagó.';
      }
    }
    return null;
  }

  get noteError(): string | null {
    const ctrl = this.form.controls.note;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    if (ctrl.errors?.['maxlength']) {
      return 'La nota puede tener máximo 500 caracteres.';
    }
    return null;
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();

    if (
      this.form.invalid ||
      this.descriptionError !== null ||
      this.categoryError !== null ||
      this.amountError !== null ||
      this.noteError !== null ||
      this.saving()
    ) {
      return;
    }

    const raw = this.form.getRawValue();
    const parsedAmount = parseCopInput(raw.amount_cop);
    if (parsedAmount === null) {
      return;
    }

    const input: ExpenseInput = {
      category_id: raw.category_id.trim(),
      description: raw.description.trim(),
      amount_cop: parsedAmount,
      note: raw.note.trim() ? raw.note.trim() : null,
    };

    this.saving.set(true);
    try {
      const saved = this.expense
        ? await this.budgetRepo.updateExpense(this.expense.id, input)
        : await this.budgetRepo.createExpense(this.creationId, this.eventId, input);
      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos guardar el gasto.';
      const toast = await this.toastCtrl.create({
        message,
        duration: 3000,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.saving.set(false);
    }
  }
}
