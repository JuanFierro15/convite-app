import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  BudgetRepository,
  EventContextService,
  ExpenseCategoryRow,
  ExpensePaymentRow,
  ExpenseStatus,
  ExpenseWithPayments,
  TeamProfileRow,
  TeamProfilesRepository,
  expenseStatus,
  expenseStatusBadgeClass,
  expenseStatusLabel,
  formatCop,
  formatDayMonth,
  paidTotal,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';
import { createDiscardGuard } from '../../invitaciones/formulario/discard-guard';
import { ExpenseFormComponent } from '../formularios/expense-form.component';
import { openPaymentForm } from '../formularios/payment-form.component';

@Component({
  selector: 'app-expense-detail',
  standalone: true,
  templateUrl: './expense-detail.page.html',
  styleUrls: ['./expense-detail.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonSpinner,
    EmptyStateComponent,
  ],
})
export class ExpenseDetailPage implements ViewWillEnter {
  private readonly eventContext = inject(EventContextService);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly teamProfiles = inject(TeamProfilesRepository);
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly id = input.required<string>();
  readonly expenseId = input.required<string>();

  readonly expense = signal<ExpenseWithPayments | null>(null);
  readonly categories = signal<ExpenseCategoryRow[]>([]);
  readonly profiles = signal<TeamProfileRow[]>([]);
  readonly canManageProfiles = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly deletingPaymentId = signal<string | null>(null);
  readonly deletingExpense = signal<boolean>(false);

  private hasLoadedOnce = false;

  readonly paid = computed<number>(() => paidTotal(this.expense()?.payments ?? []));

  readonly balance = computed<number>(() => {
    const exp = this.expense();
    if (!exp) {
      return 0;
    }
    return Math.max(0, exp.amount_cop - this.paid());
  });

  readonly status = computed<ExpenseStatus>(() => {
    const exp = this.expense();
    if (!exp) {
      return 'pending';
    }
    return expenseStatus(exp.amount_cop, this.paid());
  });

  readonly statusLabel = computed<string>(() => expenseStatusLabel(this.status()));

  readonly statusBadgeClass = computed<string>(() => expenseStatusBadgeClass(this.status()));

  readonly categoryName = computed<string>(() => {
    const exp = this.expense();
    if (!exp) {
      return '';
    }
    const cat = this.categories().find((c) => c.id === exp.category_id);
    return cat ? cat.name : 'Sin categoría';
  });

  readonly activeProfiles = computed<TeamProfileRow[]>(() =>
    this.profiles().filter((p) => !p.archived_at),
  );

  private readonly profileMap = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const p of this.profiles()) {
      map.set(p.id, p.name);
    }
    return map;
  });

  constructor() {
    addIcons({
      trashOutline,
      createOutline,
      'chevron-back-outline': chevronBackOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.initialize(false);
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.initialize(true);
    } finally {
      event.target.complete();
    }
  }

  retryLoad(): void {
    void this.initialize(true);
  }

  getProfileName(profileId: string): string {
    return this.profileMap().get(profileId) ?? 'Perfil no disponible';
  }

  formatMoney(amount: number): string {
    return formatCop(amount);
  }

  formatDate(dateStr: string): string {
    return formatDayMonth(dateStr);
  }

  private async initialize(forceContext: boolean): Promise<void> {
    const eventId = this.id();

    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      await this.eventContext.load(eventId, { force: forceContext });
      const contextError = this.eventContext.error();
      if (contextError) {
        if (!this.hasLoadedOnce) {
          this.error.set(contextError);
        } else {
          await this.showToast(contextError, 'danger');
        }
        return;
      }

      if (this.eventContext.role() !== 'owner') {
        await this.showToast('Solo los propietarios pueden ver los gastos.', 'danger');
        await this.router.navigate(['/eventos', eventId, 'panel'], { replaceUrl: true });
        return;
      }

      await this.loadExpenseData(!this.hasLoadedOnce);
    } finally {
      this.loading.set(false);
    }
  }

  async loadExpenseData(showLoading: boolean): Promise<void> {
    if (showLoading) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      const event = this.eventContext.event();
      const teamId = event?.team_id;

      const [expenseData, categoriesData, profilesData, canManageData] = await Promise.all([
        this.budgetRepo.getExpense(this.expenseId()),
        this.budgetRepo.listCategories(this.id()),
        teamId ? this.teamProfiles.list(teamId) : Promise.resolve([]),
        teamId ? this.teamProfiles.canManage(this.id()) : Promise.resolve(false),
      ]);

      this.expense.set(expenseData);
      this.categories.set(categoriesData);
      this.profiles.set(profilesData);
      this.canManageProfiles.set(canManageData);
      this.hasLoadedOnce = true;
      this.error.set(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos cargar el gasto.';
      if (!this.hasLoadedOnce) {
        this.error.set(message);
      } else {
        await this.showToast(message, 'danger');
      }
    } finally {
      if (showLoading) {
        this.loading.set(false);
      }
    }
  }

  async openEdit(): Promise<void> {
    const current = this.expense();
    if (!current) {
      return;
    }

    const guard = createDiscardGuard(this.alertCtrl, 'Lo que escribiste se perderá.');
    const modal = await this.modalCtrl.create({
      component: ExpenseFormComponent,
      componentProps: {
        eventId: this.id(),
        expense: current,
        categories: this.categories(),
        discardGuard: guard,
      },
      canDismiss: guard.canDismiss,
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
      expandToScroll: false,
    });

    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      await this.loadExpenseData(false);
    }
  }

  async openRegisterPayment(): Promise<void> {
    const current = this.expense();
    if (!current || this.status() === 'paid') {
      return;
    }

    const role = await openPaymentForm(this.modalCtrl, this.alertCtrl, this.router, {
      eventId: this.id(),
      expenseId: current.id,
      balance: this.balance(),
      profiles: this.activeProfiles(),
      canManageProfiles: this.canManageProfiles(),
    });

    if (role === 'saved') {
      await this.loadExpenseData(false);
    }
  }

  async confirmDeletePayment(payment: ExpensePaymentRow): Promise<void> {
    if (this.deletingPaymentId() !== null) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Borrar pago',
      message: `¿Borrar este pago de ${formatCop(payment.amount_cop)}?`,
      cssClass: 'convite-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          cssClass: 'convite-alert__confirm',
          handler: () => {
            void this.deletePayment(payment.id);
          },
        },
      ],
    });

    await alert.present();
  }

  private async deletePayment(paymentId: string): Promise<void> {
    this.deletingPaymentId.set(paymentId);
    try {
      await this.budgetRepo.removePayment(paymentId);
      await this.loadExpenseData(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos borrar el pago.';
      await this.showToast(message, 'danger');
    } finally {
      this.deletingPaymentId.set(null);
    }
  }

  async confirmDeleteExpense(): Promise<void> {
    const current = this.expense();
    if (!current || this.deletingExpense()) {
      return;
    }

    const hasPayments = (current.payments?.length ?? 0) > 0;
    const paidCop = this.paid();

    let message = hasPayments
      ? `¿Borrar ${current.description}? Ya se habían pagado ${formatCop(paidCop)} y esos pagos también se borran.`
      : `¿Borrar ${current.description}?`;

    if (current.task) {
      message += ' La tarea se conserva.';
    }

    const alert = await this.alertCtrl.create({
      header: 'Borrar gasto',
      message,
      cssClass: 'convite-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          cssClass: 'convite-alert__confirm',
          handler: () => {
            void this.deleteExpense();
          },
        },
      ],
    });

    await alert.present();
  }

  private async deleteExpense(): Promise<void> {
    const current = this.expense();
    if (!current) {
      return;
    }

    this.deletingExpense.set(true);
    try {
      await this.budgetRepo.removeExpense(current.id);
      await this.router.navigate(['/eventos', this.id(), 'presupuesto'], { replaceUrl: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos borrar el gasto.';
      await this.showToast(message, 'danger');
    } finally {
      this.deletingExpense.set(false);
    }
  }

  goToBudget(): void {
    void this.router.navigate(['/eventos', this.id(), 'presupuesto'], { replaceUrl: true });
  }

  private async showToast(
    message: string,
    color: 'danger' | 'success' | 'medium',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
