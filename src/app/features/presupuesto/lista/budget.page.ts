import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  chevronBackOutline,
  chevronForwardOutline,
  createOutline,
} from 'ionicons/icons';
import {
  BudgetRepository,
  BudgetSummary,
  CategoryBreakdown,
  EventContextService,
  ExpenseCategoryRow,
  ExpenseStatus,
  ExpenseWithPayments,
  ProfileBreakdown,
  RealtimeService,
  TeamProfileRow,
  TeamProfilesRepository,
  budgetSummary,
  byCategory,
  byProfile,
  expenseStatus,
  expenseStatusBadgeClass,
  expenseStatusLabel,
  formatCop,
  paginate,
  paidTotal,
} from '../../../core';
import { EmptyStateComponent, PaginationComponent } from '../../../shared';
import { createDiscardGuard } from '../../invitaciones/formulario/discard-guard';
import { ExpenseFormComponent } from '../formularios/expense-form.component';

export const EXPENSES_PAGE_SIZE = 6;
export type ExpenseFilter = 'all' | 'to_pay' | 'paid';

export function showsTaskDoneMark(expense: ExpenseWithPayments): boolean {
  if (!expense.task?.done_at) {
    return false;
  }
  const status = expenseStatus(expense.amount_cop, paidTotal(expense.payments ?? []));
  return status !== 'paid';
}

@Component({
  selector: 'app-budget',
  standalone: true,
  templateUrl: './budget.page.html',
  styleUrls: ['./budget.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
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
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonSpinner,
    EmptyStateComponent,
    PaginationComponent,
  ],
})
export class BudgetPage implements ViewWillEnter, ViewWillLeave {
  private readonly eventContext = inject(EventContextService);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly teamProfiles = inject(TeamProfilesRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly id = input.required<string>();

  readonly showsTaskDoneMark = showsTaskDoneMark;

  readonly expenses = signal<ExpenseWithPayments[]>([]);
  readonly categories = signal<ExpenseCategoryRow[]>([]);
  readonly profiles = signal<TeamProfileRow[]>([]);
  readonly canManage = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly filter = signal<ExpenseFilter>('all');
  readonly currentPage = signal<number>(1);

  readonly content = viewChild(IonContent);
  readonly expenseListStart = viewChild<ElementRef<HTMLElement>>('expenseListStart');

  private hasLoadedOnce = false;
  private stopRealtime: (() => void) | null = null;

  readonly summary = computed<BudgetSummary>(() =>
    budgetSummary(this.eventContext.event()?.budget_cop ?? null, this.expenses()),
  );

  readonly categoryBreakdown = computed<CategoryBreakdown[]>(() =>
    byCategory(this.expenses(), this.categories()),
  );

  readonly profileBreakdown = computed<ProfileBreakdown[]>(() =>
    byProfile(this.expenses(), this.profiles()),
  );

  private readonly categoryMap = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const cat of this.categories()) {
      map.set(cat.id, cat.name);
    }
    return map;
  });

  readonly filteredExpenses = computed<ExpenseWithPayments[]>(() => {
    const all = this.expenses();
    const active = this.filter();
    if (active === 'to_pay') {
      return all.filter((e) => {
        const st = expenseStatus(e.amount_cop, paidTotal(e.payments ?? []));
        return st === 'pending' || st === 'partial';
      });
    }
    if (active === 'paid') {
      return all.filter((e) => {
        const st = expenseStatus(e.amount_cop, paidTotal(e.payments ?? []));
        return st === 'paid';
      });
    }
    return all;
  });

  readonly pagedExpenses = computed(() =>
    paginate(this.filteredExpenses(), this.currentPage(), EXPENSES_PAGE_SIZE),
  );

  constructor() {
    addIcons({
      add,
      createOutline,
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.initialize(false);
    if (this.eventContext.role() !== 'owner') {
      return;
    }

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      this.id(),
      ['tasks'],
      () => {
        void this.loadData(false);
      },
      this.destroyRef,
    );
  }

  ionViewWillLeave(): void {
    this.stopRealtime?.();
    this.stopRealtime = null;
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

  onFilterChange(event: CustomEvent): void {
    const val = (event.detail as { value?: string }).value;
    if (val === 'all' || val === 'to_pay' || val === 'paid') {
      this.filter.set(val);
      this.currentPage.set(1);
    }
  }

  goToPreviousPage(): void {
    const current = this.pagedExpenses().page;
    if (current > 1) {
      this.currentPage.set(current - 1);
      this.scrollToExpenseListStart();
    }
  }

  goToNextPage(): void {
    const { page, totalPages } = this.pagedExpenses();
    if (page < totalPages) {
      this.currentPage.set(page + 1);
      this.scrollToExpenseListStart();
    }
  }

  formatMoney(amount: number): string {
    return formatCop(amount);
  }

  getCategoryName(categoryId: string): string {
    return this.categoryMap().get(categoryId) ?? 'Sin categoría';
  }

  getStatus(expense: ExpenseWithPayments): ExpenseStatus {
    return expenseStatus(expense.amount_cop, paidTotal(expense.payments ?? []));
  }

  getStatusLabel(expense: ExpenseWithPayments): string {
    return expenseStatusLabel(this.getStatus(expense));
  }

  getStatusBadgeClass(expense: ExpenseWithPayments): string {
    return expenseStatusBadgeClass(this.getStatus(expense));
  }

  isPartial(expense: ExpenseWithPayments): boolean {
    return this.getStatus(expense) === 'partial';
  }

  getMissingAmount(expense: ExpenseWithPayments): number {
    return Math.max(0, expense.amount_cop - paidTotal(expense.payments ?? []));
  }

  goToExpenseDetail(expenseId: string): void {
    void this.router.navigate(['/eventos', this.id(), 'presupuesto', 'gastos', expenseId]);
  }

  async openCreateExpense(): Promise<void> {
    if (this.categories().length === 0) {
      const alert = await this.alertCtrl.create({
        header: 'Primero crea una categoría.',
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Ir a categorías',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
            handler: () => {
              void this.router.navigate([
                '/eventos',
                this.id(),
                'presupuesto',
                'categorias',
              ]);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    const guard = createDiscardGuard(this.alertCtrl, 'Lo que escribiste se perderá.');
    const modal = await this.modalCtrl.create({
      component: ExpenseFormComponent,
      componentProps: {
        eventId: this.id(),
        expense: null,
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
      await this.loadData(false);
    }
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
        await this.showToast('Solo los propietarios pueden ver el presupuesto.', 'danger');
        await this.router.navigate(['/eventos', eventId, 'panel'], { replaceUrl: true });
        return;
      }

      await this.loadData(!this.hasLoadedOnce);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadData(showLoading: boolean): Promise<void> {
    if (showLoading) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      const event = this.eventContext.event();
      const teamId = event?.team_id;

      const [expensesData, categoriesData, profilesData, canManageData] = await Promise.all([
        this.budgetRepo.listExpenses(this.id()),
        this.budgetRepo.listCategories(this.id()),
        teamId ? this.teamProfiles.list(teamId) : Promise.resolve([]),
        teamId ? this.teamProfiles.canManage(this.id()) : Promise.resolve(false),
      ]);

      this.expenses.set(expensesData);
      this.categories.set(categoriesData);
      this.profiles.set(profilesData);
      this.canManage.set(canManageData);
      this.currentPage.set(this.pagedExpenses().page);
      this.hasLoadedOnce = true;
      this.error.set(null);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar el presupuesto.';
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

  private scrollToExpenseListStart(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }
    requestAnimationFrame(async () => {
      try {
        const content = this.content();
        const anchor = this.expenseListStart()?.nativeElement;
        if (!content || !anchor || typeof content.getScrollElement !== 'function') {
          return;
        }
        const scrollEl = await content.getScrollElement();
        if (
          !scrollEl ||
          typeof scrollEl.getBoundingClientRect !== 'function' ||
          typeof anchor.getBoundingClientRect !== 'function'
        ) {
          return;
        }
        const anchorRect = anchor.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const y = Math.max(0, anchorRect.top - scrollRect.top + (scrollEl.scrollTop ?? 0) - 16);
        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = prefersReducedMotion ? 0 : 300;
        if (typeof content.scrollToPoint === 'function') {
          await content.scrollToPoint(0, y, duration);
        }
      } catch {
        // En entornos sin soporte de scroll no hace nada.
      }
    });
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
