import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController } from '@ionic/angular';
import {
  BudgetRepository,
  ExpenseCategoryRow,
  FreeExpense,
  TaskExpenseLink,
  TaskRow,
  TasksRepository,
  TeamProfileRow,
} from '../../../core';
import { TaskFormComponent } from './task-form.component';

describe('TaskFormComponent', () => {
  let fixture: ComponentFixture<TaskFormComponent>;
  let component: TaskFormComponent;
  let mockTasksRepo: {
    save: ReturnType<typeof vi.fn>;
  };
  let mockBudgetRepo: {
    listCategories: ReturnType<typeof vi.fn>;
    freeExpenses: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: {
    dismiss: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  const mockCategories: ExpenseCategoryRow[] = [
    {
      id: 'cat-1',
      event_id: 'evt-1',
      name: 'Comida y bebidas',
      sort_order: 1,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      event_id: 'evt-1',
      name: 'Decoración',
      sort_order: 2,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  const mockFreeExpenses: FreeExpense[] = [
    {
      id: 'exp-free-1',
      description: 'Piñata y dulces',
      amount_cop: 120000,
    },
  ];

  const mockProfiles: TeamProfileRow[] = [
    {
      id: 'prof-1',
      team_id: 'team-1',
      name: 'Juan',
      sort_order: 1,
      archived_at: null,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'prof-archived',
      team_id: 'team-1',
      name: 'Pedro (Archivado)',
      sort_order: 2,
      archived_at: '2026-10-15T00:00:00Z',
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'prof-archived-other',
      team_id: 'team-1',
      name: 'Laura (Archivado)',
      sort_order: 3,
      archived_at: '2026-10-15T00:00:00Z',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockTasksRepo = {
      save: vi.fn().mockResolvedValue({
        id: 'task-1',
        title: 'Comprar dulces',
        due_date: '2026-11-20',
        done_at: null,
      }),
    };
    mockBudgetRepo = {
      listCategories: vi.fn().mockResolvedValue([...mockCategories]),
      freeExpenses: vi.fn().mockResolvedValue([...mockFreeExpenses]),
    };
    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [TaskFormComponent],
      providers: [
        { provide: TasksRepository, useValue: mockTasksRepo },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'evt-1';
    component.profiles = [...mockProfiles];
  });

  it('valida campos obligatorios: título y fecha límite', async () => {
    component.ngOnInit();
    fixture.detectChanges();

    await component.save();

    expect(component.titleError).toBe('El título es obligatorio.');
    expect(component.dueDateError).toBe('La fecha límite es obligatoria.');
    expect(mockTasksRepo.save).not.toHaveBeenCalled();
  });

  it('valida campos de nuevo gasto cuando se selecciona Crear gasto nuevo', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.form.controls.title.setValue('Decorar salón');
    component.form.controls.due_date.setValue('2026-11-25');
    component.expenseMode.set('new');

    await component.save();

    expect(component.expenseDescriptionError).toBe('La descripción es obligatoria.');
    expect(component.expenseCategoryError).toBe('Elige una categoría.');
    expect(component.expenseAmountError).toBe(
      'Escribe un monto en números enteros, sin decimales.',
    );
    expect(mockTasksRepo.save).not.toHaveBeenCalled();
  });

  it('mantiene Crear gasto nuevo abierto cuando cambia un campo dentro del grupo de radios', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    component.expenseMode.set('new');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const fields = root.querySelectorAll('.new-expense-fields ion-input, .new-expense-fields ion-select');
    expect(fields.length).toBe(3);

    fields.forEach((field) => {
      field.dispatchEvent(
        new CustomEvent('ionChange', {
          bubbles: true,
          composed: true,
          detail: { value: 'Torta de 3 pisos' },
        }),
      );
    });
    fixture.detectChanges();

    expect(component.expenseMode()).toBe('new');
    expect(root.querySelector('.new-expense-fields')).not.toBeNull();
  });

  it('cambia de modo cuando el evento viene del propio grupo de radios', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const group = (fixture.nativeElement as HTMLElement).querySelector('ion-radio-group');
    group?.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, composed: true, detail: { value: 'new' } }),
    );

    expect(component.expenseMode()).toBe('new');
  });

  it('muestra aviso sin botón y deshabilita Crear gasto nuevo si no hay categorías, pero Vincular sigue disponible', async () => {
    mockBudgetRepo.listCategories.mockResolvedValue([]);
    component.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.categories().length).toBe(0);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(
      'Para crear un gasto, primero crea una categoría en Presupuesto.',
    );

    // Debe mostrar el texto sin ningún botón dentro de ese aviso
    const noCatContainer = compiled.querySelector('.no-categories-text');
    expect(noCatContainer).not.toBeNull();
    expect(noCatContainer?.querySelector('button, ion-button')).toBeNull();

    // Vincular disponible si hay gastos libres
    expect(component.freeExpenses().length).toBe(1);
    const radioLink = compiled.querySelector('ion-radio[value="link"]');
    expect(radioLink?.hasAttribute('disabled')).toBe(false);
  });

  it('envía action keep por defecto al guardar una tarea sin gasto', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.form.controls.title.setValue('Llamar al fotógrafo');
    component.form.controls.due_date.setValue('2026-11-20');

    await component.save();

    expect(mockTasksRepo.save).toHaveBeenCalledWith(
      component.taskIdSignal(),
      'evt-1',
      {
        title: 'Llamar al fotógrafo',
        due_date: '2026-11-20',
        note: null,
        assignee_profile_id: null,
      },
      { action: 'keep' },
    );
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(expect.anything(), 'saved');
  });

  it('envía action unlink si tenía gasto vinculado y se tocó Quitar el gasto', async () => {
    const mockLink: TaskExpenseLink = {
      task_id: 'task-1',
      expense_id: 'exp-1',
      description: 'Música en vivo',
      amount_cop: 500000,
      paid_cop: 0,
    };
    const mockTask: TaskRow = {
      id: 'task-1',
      event_id: 'evt-1',
      title: 'Contratar música',
      note: null,
      assignee_profile_id: null,
      due_date: '2026-11-15',
      done_at: null,
      done_by: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    component.task = mockTask;
    component.link = mockLink;
    component.ngOnInit();
    await fixture.whenStable();

    component.unlinkCurrentExpense();
    expect(component.unlinked()).toBe(true);

    await component.save();

    expect(mockTasksRepo.save).toHaveBeenCalledWith(
      'task-1',
      'evt-1',
      expect.objectContaining({ title: 'Contratar música' }),
      { action: 'unlink' },
    );
  });

  it('envía action new con id generado y datos del gasto al crear gasto nuevo', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.form.controls.title.setValue('Comprar flores');
    component.form.controls.due_date.setValue('2026-11-28');
    component.expenseMode.set('new');
    component.form.controls.expense_description.setValue('Rosas y lirios');
    component.form.controls.expense_category_id.setValue('cat-2');
    component.form.controls.expense_amount_cop.setValue('85.000');

    await component.save();

    expect(mockTasksRepo.save).toHaveBeenCalledWith(
      component.taskIdSignal(),
      'evt-1',
      expect.objectContaining({ title: 'Comprar flores' }),
      {
        action: 'new',
        expense: {
          id: component.newExpenseIdSignal(),
          category_id: 'cat-2',
          description: 'Rosas y lirios',
          amount_cop: 85000,
        },
      },
    );
  });

  it('envía action link al vincular un gasto existente', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.form.controls.title.setValue('Organizar piñata');
    component.form.controls.due_date.setValue('2026-11-28');
    component.expenseMode.set('link');
    component.form.controls.expense_linked_id.setValue('exp-free-1');

    await component.save();

    expect(mockTasksRepo.save).toHaveBeenCalledWith(
      component.taskIdSignal(),
      'evt-1',
      expect.objectContaining({ title: 'Organizar piñata' }),
      {
        action: 'link',
        expense_id: 'exp-free-1',
      },
    );
  });

  it('incluye el perfil archivado de la tarea en los perfiles disponibles, pero no otros archivados', () => {
    component.task = {
      id: 'task-1',
      event_id: 'evt-1',
      title: 'Comprar tela',
      note: null,
      assignee_profile_id: 'prof-archived',
      due_date: '2026-11-10',
      done_at: null,
      done_by: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    component.ngOnInit();

    const ids = component.availableProfiles().map((p) => p.id);
    expect(ids).toContain('prof-1'); // activo
    expect(ids).toContain('prof-archived'); // archivado asignado
    expect(ids).not.toContain('prof-archived-other'); // otro archivado
  });

  it('mantiene ids estables entre reintentos tras un error', async () => {
    mockTasksRepo.save.mockRejectedValueOnce(new Error('Fallo de red'));
    component.ngOnInit();
    await fixture.whenStable();

    const stableTaskId = component.taskIdSignal();
    const stableExpenseId = component.newExpenseIdSignal();

    component.form.controls.title.setValue('Probar reintentos');
    component.form.controls.due_date.setValue('2026-11-20');
    component.expenseMode.set('new');
    component.form.controls.expense_description.setValue('Gasto prueba');
    component.form.controls.expense_category_id.setValue('cat-1');
    component.form.controls.expense_amount_cop.setValue('50000');

    // Primer intento: falla
    await component.save();
    expect(component.saving()).toBe(false);
    expect(component.taskIdSignal()).toBe(stableTaskId);
    expect(component.newExpenseIdSignal()).toBe(stableExpenseId);

    // Segundo intento: éxito
    mockTasksRepo.save.mockResolvedValueOnce({ id: stableTaskId });
    await component.save();

    expect(mockTasksRepo.save).toHaveBeenLastCalledWith(
      stableTaskId,
      'evt-1',
      expect.anything(),
      expect.objectContaining({
        expense: expect.objectContaining({ id: stableExpenseId }),
      }),
    );
  });

  it('cierra la hoja con rol delete al tocar Borrar tarea', async () => {
    component.task = {
      id: 'task-1',
      event_id: 'evt-1',
      title: 'Tarea a borrar',
      note: null,
      assignee_profile_id: null,
      due_date: '2026-11-10',
      done_at: null,
      done_by: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };
    const mockGuard = {
      hasChanges: vi.fn().mockReturnValue(true),
      canDismiss: vi.fn().mockResolvedValue(true),
    };
    component.discardGuard = mockGuard;

    component.ngOnInit();
    await component.onDelete();

    expect(mockGuard.hasChanges()).toBe(false);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'delete');
  });
});
