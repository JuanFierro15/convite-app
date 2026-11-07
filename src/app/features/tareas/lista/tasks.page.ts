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
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  checkbox,
  chevronDownOutline,
  chevronForwardOutline,
  createOutline,
  squareOutline,
} from 'ionicons/icons';
import {
  BudgetRepository,
  EventContextService,
  RealtimeService,
  TaskExpenseLink,
  TaskGroups,
  TaskProfileFilter,
  TaskRow,
  TasksRepository,
  TeamProfileRow,
  TeamProfilesRepository,
  filterTasks,
  formatCop,
  groupTasks,
  paginate,
  shouldAskToRegisterPayment,
  taskDoneLabel,
  taskDueLabel,
  toBogotaDateInput,
} from '../../../core';
import { EmptyStateComponent, PaginationComponent } from '../../../shared';
import { createDiscardGuard } from '../../invitaciones/formulario/discard-guard';
import { openPaymentForm } from '../../presupuesto/formularios/payment-form.component';
import { TaskFormComponent } from '../formulario/task-form.component';

export const TASKS_PAGE_SIZE = 10;

@Component({
  selector: 'app-tasks',
  standalone: true,
  templateUrl: './tasks.page.html',
  styleUrls: ['./tasks.page.scss'],
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
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    EmptyStateComponent,
    PaginationComponent,
  ],
})
export class TasksPage implements ViewWillEnter, ViewWillLeave {
  private readonly eventContext = inject(EventContextService);
  private readonly tasksRepo = inject(TasksRepository);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly teamProfiles = inject(TeamProfilesRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly today = signal<string>(toBogotaDateInput(new Date()));
  readonly tasks = signal<TaskRow[]>([]);
  readonly profiles = signal<TeamProfileRow[]>([]);
  readonly links = signal<TaskExpenseLink[]>([]);
  readonly canManage = signal<boolean>(false);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly selectedFilter = signal<TaskProfileFilter>('all');
  readonly showDone = signal<boolean>(false);
  readonly updatingTaskIds = signal<Set<string>>(new Set());
  readonly currentPage = signal<number>(1);
  readonly expandedTaskIds = signal<Set<string>>(new Set());

  readonly content = viewChild(IonContent);
  readonly taskListStart = viewChild<ElementRef<HTMLDivElement>>('taskListStart');

  private stopRealtime: (() => void) | null = null;
  private hasLoadedOnce = false;

  readonly isOwner = this.eventContext.isOwner;

  readonly linksMap = computed<Map<string, TaskExpenseLink>>(() => {
    const map = new Map<string, TaskExpenseLink>();
    for (const link of this.links()) {
      map.set(link.task_id, link);
    }
    return map;
  });

  readonly profilesMap = computed<Map<string, TeamProfileRow>>(() => {
    const map = new Map<string, TeamProfileRow>();
    for (const prof of this.profiles()) {
      map.set(prof.id, prof);
    }
    return map;
  });

  readonly filterProfiles = computed<TeamProfileRow[]>(() => {
    const allTasks = this.tasks();
    return this.profiles().filter(
      (p) => p.archived_at === null || allTasks.some((t) => t.assignee_profile_id === p.id),
    );
  });

  readonly showFilter = computed<boolean>(() => {
    return this.filterProfiles().length > 0 && this.tasks().length > 0;
  });

  readonly filteredTasks = computed<TaskRow[]>(() => {
    return filterTasks(this.tasks(), this.selectedFilter());
  });

  readonly groups = computed<TaskGroups>(() => {
    return groupTasks(this.filteredTasks(), this.today());
  });

  readonly pagedPending = computed(() => {
    const pending = [...this.groups().overdue, ...this.groups().upcoming];
    return paginate(pending, this.currentPage(), TASKS_PAGE_SIZE);
  });

  readonly pagedGroups = computed(() => {
    const overdueSet = new Set(this.groups().overdue.map((t) => t.id));
    const pagedItems = this.pagedPending().items;
    const overdue: TaskRow[] = [];
    const upcoming: TaskRow[] = [];
    for (const task of pagedItems) {
      if (overdueSet.has(task.id)) {
        overdue.push(task);
      } else {
        upcoming.push(task);
      }
    }
    return { overdue, upcoming };
  });

  constructor() {
    addIcons({
      add,
      createOutline,
      chevronDownOutline,
      chevronForwardOutline,
      checkbox,
      squareOutline,
    });
  }

  ionViewWillEnter(): void {
    const eventId = this.id();
    this.today.set(toBogotaDateInput(new Date()));

    if (this.eventContext.event()?.id !== eventId) {
      this.hasLoadedOnce = false;
      this.tasks.set([]);
      this.profiles.set([]);
      this.links.set([]);
      this.canManage.set(false);
      this.currentPage.set(1);
      this.expandedTaskIds.set(new Set());
    }

    void this.initialize(eventId);

    this.stopRealtime?.();
    this.stopRealtime = this.realtime.watch(
      eventId,
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

  async retryLoad(): Promise<void> {
    await this.initialize(this.id());
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    try {
      this.today.set(toBogotaDateInput(new Date()));
      await this.loadData(false);
    } finally {
      const target = event.target as HTMLIonRefresherElement | null;
      await target?.complete();
    }
  }

  private async initialize(eventId: string): Promise<void> {
    if (!this.hasLoadedOnce) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      await this.eventContext.load(eventId, { force: !this.hasLoadedOnce });
      const contextError = this.eventContext.error();
      if (contextError) {
        if (!this.hasLoadedOnce) {
          this.error.set(contextError);
        } else {
          await this.showToast(contextError, 'danger');
        }
        return;
      }

      await this.loadData(!this.hasLoadedOnce);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadData(showLoading: boolean): Promise<void> {
    const eventId = this.id();
    this.today.set(toBogotaDateInput(new Date()));

    if (showLoading) {
      this.loading.set(true);
      this.error.set(null);
    }

    try {
      const event = this.eventContext.event();
      const teamId = event?.team_id;

      const tasksPromise = this.tasksRepo.list(eventId);
      const profilesPromise = teamId ? this.teamProfiles.list(teamId) : Promise.resolve([]);

      if (this.isOwner()) {
        const [tasksData, profilesData, linksData, canManageData] = await Promise.all([
          tasksPromise,
          profilesPromise,
          this.budgetRepo.linksForTasks(eventId),
          this.teamProfiles.canManage(eventId),
        ]);
        this.tasks.set(tasksData);
        this.profiles.set(profilesData);
        this.links.set(linksData);
        this.canManage.set(canManageData);
      } else {
        const [tasksData, profilesData] = await Promise.all([tasksPromise, profilesPromise]);
        this.tasks.set(tasksData);
        this.profiles.set(profilesData);
        this.links.set([]);
        this.canManage.set(false);
      }

      this.hasLoadedOnce = true;
      this.error.set(null);
      this.currentPage.set(this.pagedPending().page);
      const existingTaskIds = new Set(this.tasks().map((t) => t.id));
      this.expandedTaskIds.update((current) => {
        const next = new Set<string>();
        for (const taskId of current) {
          if (existingTaskIds.has(taskId)) {
            next.add(taskId);
          }
        }
        return next;
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'No pudimos cargar las tareas.';
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

  onFilterChange(event: CustomEvent): void {
    const value = event.detail.value as TaskProfileFilter;
    this.selectedFilter.set(value);
    this.currentPage.set(1);
  }

  toggleShowDone(): void {
    this.showDone.update((v) => !v);
  }

  toggleExpanded(taskId: string): void {
    this.expandedTaskIds.update((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  goToPreviousPage(): void {
    const current = this.pagedPending().page;
    if (current > 1) {
      this.currentPage.set(current - 1);
      this.scrollToTaskListStart();
    }
  }

  goToNextPage(): void {
    const { page, totalPages } = this.pagedPending();
    if (page < totalPages) {
      this.currentPage.set(page + 1);
      this.scrollToTaskListStart();
    }
  }

  private scrollToTaskListStart(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }
    requestAnimationFrame(async () => {
      try {
        const content = this.content();
        const anchor = this.taskListStart()?.nativeElement;
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

  isUpdating(taskId: string): boolean {
    return this.updatingTaskIds().has(taskId);
  }

  getAssigneeName(profileId: string | null): string {
    if (!profileId) {
      return 'Sin asignar';
    }
    const prof = this.profilesMap().get(profileId);
    return prof ? prof.name : 'Sin asignar';
  }

  getTaskDateLabel(task: TaskRow): string {
    if (task.done_at !== null) {
      return taskDoneLabel(task.done_at);
    }
    return taskDueLabel(task.due_date, this.today());
  }

  async toggleTaskDone(task: TaskRow): Promise<void> {
    if (this.updatingTaskIds().has(task.id)) {
      return;
    }

    const willBeDone = task.done_at === null;
    const originalTasks = this.tasks();

    // Cambio optimista en el signal
    this.tasks.set(
      originalTasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              done_at: willBeDone ? new Date().toISOString() : null,
              done_by: willBeDone ? 'me' : null,
            }
          : t,
      ),
    );
    this.currentPage.set(this.pagedPending().page);

    this.updatingTaskIds.update((set) => new Set(set).add(task.id));

    try {
      const result = await this.tasksRepo.setDone(task.id, willBeDone);

      this.tasks.set(
        this.tasks().map((t) =>
          t.id === task.id
            ? {
                ...t,
                done_at: result.done_at,
                done_by: result.done_by,
              }
            : t,
        ),
      );
      this.currentPage.set(this.pagedPending().page);

      // Al marcar con éxito como propietario: verificar si pregunta pago
      if (willBeDone && this.isOwner()) {
        const link = this.linksMap().get(task.id) ?? null;
        if (
          shouldAskToRegisterPayment({
            isOwner: true,
            marking: true,
            link,
          })
        ) {
          await this.promptRegisterPayment(link!);
        }
      }
    } catch (err) {
      // Revertir optimismo
      this.tasks.set(originalTasks);
      this.currentPage.set(this.pagedPending().page);
      const message =
        err instanceof Error && err.message ? err.message : 'Error al actualizar la tarea';
      await this.showToast(message, 'danger');
    } finally {
      this.updatingTaskIds.update((set) => {
        const next = new Set(set);
        next.delete(task.id);
        return next;
      });
    }
  }

  private async promptRegisterPayment(link: TaskExpenseLink): Promise<void> {
    const balance = link.amount_cop - link.paid_cop;
    const alert = await this.alertCtrl.create({
      cssClass: 'convite-alert',
      header: '¿Registrar el pago?',
      message: `Esta tarea tiene un gasto con ${formatCop(balance)} por pagar.`,
      buttons: [
        {
          text: 'Ahora no',
          role: 'cancel',
        },
        {
          text: 'Registrar pago',
          handler: () => {
            void this.openPaymentRegistration(link, balance);
          },
        },
      ],
    });
    await alert.present();
  }

  private async openPaymentRegistration(link: TaskExpenseLink, balance: number): Promise<void> {
    const activeProfiles = this.profiles().filter((p) => p.archived_at === null);
    const result = await openPaymentForm(this.modalCtrl, this.alertCtrl, this.router, {
      eventId: this.id(),
      expenseId: link.expense_id,
      balance,
      profiles: activeProfiles,
      canManageProfiles: this.canManage(),
    });
    if (result === 'saved') {
      await this.loadData(false);
    }
  }

  onEditTask(event: MouseEvent | Event, task: TaskRow): void {
    event.stopPropagation();
    void this.openTaskModal(task);
  }

  async openCreateModal(): Promise<void> {
    await this.openTaskModal(null);
  }

  async openTaskModal(task: TaskRow | null): Promise<void> {
    const guard = createDiscardGuard(this.alertCtrl, 'Lo que escribiste se perderá.');
    const modal = await this.modalCtrl.create({
      component: TaskFormComponent,
      componentProps: {
        eventId: this.id(),
        task,
        profiles: this.profiles(),
        link: task ? (this.linksMap().get(task.id) ?? null) : null,
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
    } else if (role === 'delete' && task) {
      await this.confirmAndDeleteTask(task);
    }
  }

  private async confirmAndDeleteTask(task: TaskRow): Promise<void> {
    const link = this.linksMap().get(task.id) ?? null;

    if (!link) {
      // Caso 1: Sin gasto
      const alert = await this.alertCtrl.create({
        cssClass: 'convite-alert',
        header: 'Borrar tarea',
        message: `¿Borrar ${task.title}?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Borrar',
            role: 'destructive',
            handler: async () => {
              await this.executeDelete(task.id, false);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    if (link.paid_cop === 0) {
      // Caso 2: Gasto sin pagos
      const alert = await this.alertCtrl.create({
        cssClass: 'convite-alert',
        header: 'Borrar tarea',
        message: `¿Borrar ${task.title}? Tiene un gasto de ${formatCop(link.amount_cop)} sin pagos.`,
        inputs: [
          {
            name: 'delete_expense',
            type: 'checkbox',
            label: 'Borrar también el gasto',
            value: 'delete_expense',
            checked: false,
          },
        ],
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Borrar',
            role: 'destructive',
            handler: async (data) => {
              const checked = Array.isArray(data)
                ? data.includes('delete_expense')
                : Boolean(data?.delete_expense);
              await this.executeDelete(task.id, checked);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    // Caso 3: Gasto con pagos
    const alert = await this.alertCtrl.create({
      cssClass: 'convite-alert',
      header: 'Borrar tarea',
      message: `¿Borrar ${task.title}? Su gasto tiene pagos, así que se conserva y queda sin tarea.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: async () => {
            await this.executeDelete(task.id, false);
          },
        },
      ],
    });
    await alert.present();
  }

  private async executeDelete(taskId: string, deleteExpense: boolean): Promise<void> {
    try {
      await this.tasksRepo.remove(taskId, deleteExpense);
      await this.loadData(false);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Error al borrar la tarea';
      await this.showToast(message, 'danger');
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
