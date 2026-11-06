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
  IonRadio,
  IonRadioGroup,
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
  FreeExpense,
  TaskExpenseAction,
  TaskExpenseLink,
  TaskInput,
  TaskRow,
  TasksRepository,
  TeamProfileRow,
  formatCop,
  newId,
  parseCopInput,
} from '../../../core';
import { DiscardGuard } from '../../invitaciones/formulario/discard-guard';

function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return value.trim().length === 0 ? { required: true } : null;
}

@Component({
  selector: 'app-task-form',
  standalone: true,
  templateUrl: './task-form.component.html',
  styleUrls: ['./task-form.component.scss'],
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
    IonRadioGroup,
    IonRadio,
    IonSpinner,
  ],
})
export class TaskFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  @Input() eventId = '';
  @Input() task: TaskRow | null = null;
  @Input() profiles: TeamProfileRow[] = [];
  @Input() link: TaskExpenseLink | null = null;
  @Input() discardGuard?: DiscardGuard;

  // Ids estables generados una sola vez por apertura de la hoja
  readonly taskIdSignal = signal<string>('');
  readonly newExpenseIdSignal = signal<string>('');

  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);

  readonly loadingExpensesData = signal<boolean>(false);
  readonly expenseDataError = signal<string | null>(null);
  readonly categories = signal<ExpenseCategoryRow[]>([]);
  readonly freeExpenses = signal<FreeExpense[]>([]);

  readonly unlinked = signal<boolean>(false);
  readonly expenseMode = signal<'none' | 'new' | 'link'>('none');

  readonly isEditing = computed<boolean>(() => this.task !== null);

  readonly availableProfiles = computed<TeamProfileRow[]>(() => {
    const profs = this.profiles;
    const currentAssigneeId = this.task?.assignee_profile_id ?? null;
    return profs.filter(
      (p) => p.archived_at === null || (currentAssigneeId !== null && p.id === currentAssigneeId),
    );
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120), notBlankValidator]],
    assignee_profile_id: [''],
    due_date: ['', [Validators.required, notBlankValidator]],
    note: ['', [Validators.maxLength(500)]],
    expense_description: ['', [Validators.maxLength(120)]],
    expense_category_id: [''],
    expense_amount_cop: [''],
    expense_linked_id: [''],
  });

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    this.taskIdSignal.set(this.task?.id ?? newId());
    this.newExpenseIdSignal.set(newId());

    if (this.task) {
      this.form.reset({
        title: this.task.title,
        assignee_profile_id: this.task.assignee_profile_id ?? '',
        due_date: this.task.due_date,
        note: this.task.note ?? '',
        expense_description: '',
        expense_category_id: '',
        expense_amount_cop: '',
        expense_linked_id: '',
      });
    } else {
      this.form.reset({
        title: '',
        assignee_profile_id: '',
        due_date: '',
        note: '',
        expense_description: '',
        expense_category_id: '',
        expense_amount_cop: '',
        expense_linked_id: '',
      });
    }

    if (this.discardGuard) {
      this.discardGuard.hasChanges = () =>
        this.form.dirty || this.unlinked() || this.expenseMode() !== 'none';
    }

    void this.loadExpenseData();
  }

  private async loadExpenseData(): Promise<void> {
    if (!this.eventId) {
      return;
    }

    this.loadingExpensesData.set(true);
    this.expenseDataError.set(null);

    try {
      const [cats, freeExps] = await Promise.all([
        this.budgetRepo.listCategories(this.eventId),
        this.budgetRepo.freeExpenses(this.eventId),
      ]);
      this.categories.set(cats);
      this.freeExpenses.set(freeExps);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar los datos de presupuesto.';
      this.expenseDataError.set(message);
    } finally {
      this.loadingExpensesData.set(false);
    }
  }

  get titleError(): string | null {
    const ctrl = this.form.controls.title;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'El título es obligatorio.';
    }
    if (val.length > 120) {
      return 'El título puede tener máximo 120 caracteres.';
    }
    return null;
  }

  get dueDateError(): string | null {
    const ctrl = this.form.controls.due_date;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'La fecha límite es obligatoria.';
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

  get expenseDescriptionError(): string | null {
    if (this.expenseMode() !== 'new') {
      return null;
    }
    const ctrl = this.form.controls.expense_description;
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

  get expenseCategoryError(): string | null {
    if (this.expenseMode() !== 'new') {
      return null;
    }
    const ctrl = this.form.controls.expense_category_id;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'Elige una categoría.';
    }
    return null;
  }

  get expenseAmountError(): string | null {
    if (this.expenseMode() !== 'new') {
      return null;
    }
    const ctrl = this.form.controls.expense_amount_cop;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = ctrl.value ?? '';
    const parsed = parseCopInput(val);
    if (parsed === null) {
      return 'Escribe un monto en números enteros, sin decimales.';
    }
    if (parsed < 1 || parsed > 999_999_999) {
      return 'El monto debe estar entre $ 1 y $ 999.999.999.';
    }
    return null;
  }

  get expenseLinkedError(): string | null {
    if (this.expenseMode() !== 'link') {
      return null;
    }
    const ctrl = this.form.controls.expense_linked_id;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'Elige un gasto para vincular.';
    }
    return null;
  }

  formatMoney(value: number): string {
    return formatCop(value);
  }

  unlinkCurrentExpense(): void {
    this.unlinked.set(true);
    this.expenseMode.set('none');
    this.form.markAsDirty();
  }

  onExpenseModeChange(event: CustomEvent): void {
    const val = event.detail.value as 'none' | 'new' | 'link';
    this.expenseMode.set(val);
    this.form.markAsDirty();
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async onDelete(): Promise<void> {
    if (this.discardGuard) {
      this.discardGuard.hasChanges = () => false;
    }
    await this.modalCtrl.dismiss(null, 'delete');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();

    if (this.titleError !== null || this.dueDateError !== null || this.noteError !== null) {
      return;
    }

    if (this.expenseMode() === 'new') {
      if (
        this.expenseDescriptionError !== null ||
        this.expenseCategoryError !== null ||
        this.expenseAmountError !== null
      ) {
        return;
      }
    }

    if (this.expenseMode() === 'link') {
      if (this.expenseLinkedError !== null) {
        return;
      }
    }

    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      const raw = this.form.getRawValue();
      const trimmedNote = raw.note.trim();
      const trimmedAssignee = raw.assignee_profile_id.trim();

      const taskInput: TaskInput = {
        title: raw.title.trim(),
        due_date: raw.due_date.trim(),
        note: trimmedNote ? trimmedNote : null,
        assignee_profile_id: trimmedAssignee ? trimmedAssignee : null,
      };

      let expenseAction: TaskExpenseAction = { action: 'keep' };

      if (this.expenseDataError() !== null) {
        expenseAction = { action: 'keep' };
      } else if (this.link !== null && !this.unlinked()) {
        expenseAction = { action: 'keep' };
      } else {
        switch (this.expenseMode()) {
          case 'none':
            expenseAction = this.link !== null ? { action: 'unlink' } : { action: 'keep' };
            break;
          case 'new': {
            const parsedAmount = parseCopInput(raw.expense_amount_cop)!;
            expenseAction = {
              action: 'new',
              expense: {
                id: this.newExpenseIdSignal(),
                category_id: raw.expense_category_id,
                description: raw.expense_description.trim(),
                amount_cop: parsedAmount,
              },
            };
            break;
          }
          case 'link':
            expenseAction = {
              action: 'link',
              expense_id: raw.expense_linked_id,
            };
            break;
        }
      }

      const savedTask = await this.tasksRepo.save(
        this.taskIdSignal(),
        this.eventId,
        taskInput,
        expenseAction,
      );

      await this.modalCtrl.dismiss(savedTask, 'saved');
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Error al guardar la tarea';
      await this.showToast(message, 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  private async showToast(message: string, color: 'danger' | 'success' = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
