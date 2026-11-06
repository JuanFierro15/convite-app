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
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
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
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import {
  BudgetRepository,
  PaymentInput,
  TeamProfileRow,
  formatCop,
  formatCopInput,
  parseCopInput,
  toBogotaDateInput,
} from '../../../core';
import { CopInputDirective } from '../../../shared';
import { DiscardGuard, createDiscardGuard } from '../../invitaciones/formulario/discard-guard';

export interface OpenPaymentFormOptions {
  eventId: string;
  expenseId: string;
  balance: number;
  profiles: TeamProfileRow[];
  canManageProfiles: boolean;
}

export async function openPaymentForm(
  modalCtrl: ModalController,
  alertCtrl: AlertController,
  router: Router,
  options: OpenPaymentFormOptions,
): Promise<'saved' | null> {
  const guard = createDiscardGuard(alertCtrl, 'Lo que escribiste se perderá.');
  const modal = await modalCtrl.create({
    component: PaymentFormComponent,
    componentProps: {
      eventId: options.eventId,
      expenseId: options.expenseId,
      balance: options.balance,
      profiles: options.profiles,
      canManageProfiles: options.canManageProfiles,
      discardGuard: guard,
    },
    canDismiss: guard.canDismiss,
    breakpoints: [0, 0.9, 1],
    initialBreakpoint: 0.9,
    expandToScroll: false,
  });

  await modal.present();
  const { role } = await modal.onWillDismiss();

  if (role === 'go-profiles') {
    await router.navigate(['/eventos', options.eventId, 'perfiles']);
    return null;
  }

  return role === 'saved' ? 'saved' : null;
}

@Component({
  selector: 'app-payment-form',
  standalone: true,
  templateUrl: './payment-form.component.html',
  styleUrls: ['./payment-form.component.scss'],
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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    CopInputDirective,
  ],
})
export class PaymentFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  @Input() eventId = '';
  @Input() expenseId = '';
  @Input() balance = 0;
  @Input() profiles: TeamProfileRow[] = [];
  @Input() canManageProfiles = false;
  @Input() discardGuard?: DiscardGuard;

  readonly saving = signal<boolean>(false);
  readonly submitted = signal<boolean>(false);
  readonly today = toBogotaDateInput(new Date());

  readonly form = this.fb.nonNullable.group({
    amount_cop: ['', [Validators.required]],
    paid_on: ['', [Validators.required]],
    paid_by_profile_id: ['', [Validators.required]],
  });

  readonly hasNoProfiles = computed(() => this.profiles.length === 0);

  constructor() {
    addIcons({ closeOutline });
  }

  ngOnInit(): void {
    const proposedAmount = this.balance > 0 ? formatCopInput(String(this.balance)).value : '';
    this.form.reset({
      amount_cop: proposedAmount,
      paid_on: this.today,
      paid_by_profile_id: '',
    });

    if (this.discardGuard) {
      this.discardGuard.hasChanges = () => this.form.dirty;
    }
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
    if (parsed > this.balance) {
      return `El pago no puede superar los ${formatCop(this.balance)} que faltan.`;
    }
    return null;
  }

  get paidOnError(): string | null {
    const ctrl = this.form.controls.paid_on;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'La fecha es obligatoria.';
    }
    if (val > this.today) {
      return 'La fecha del pago no puede ser futura.';
    }
    return null;
  }

  get profileError(): string | null {
    const ctrl = this.form.controls.paid_by_profile_id;
    if (!ctrl.touched && !this.submitted()) {
      return null;
    }
    const val = (ctrl.value ?? '').trim();
    if (!val) {
      return 'Elige quién pagó.';
    }
    return null;
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async goToProfiles(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'go-profiles');
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();

    if (this.hasNoProfiles() || this.form.invalid || this.amountError !== null || this.paidOnError !== null || this.profileError !== null || this.saving()) {
      return;
    }

    const raw = this.form.getRawValue();
    const parsedAmount = parseCopInput(raw.amount_cop);
    if (parsedAmount === null) {
      return;
    }

    const input: PaymentInput = {
      expense_id: this.expenseId,
      amount_cop: parsedAmount,
      paid_on: raw.paid_on.trim(),
      paid_by_profile_id: raw.paid_by_profile_id.trim(),
    };

    this.saving.set(true);
    try {
      const saved = await this.budgetRepo.addPayment(this.eventId, input);
      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos registrar el pago.';
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
