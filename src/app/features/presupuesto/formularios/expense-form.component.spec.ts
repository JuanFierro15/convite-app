import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController } from '@ionic/angular';
import {
  BudgetRepository,
  ExpenseCategoryRow,
  ExpenseWithPayments,
} from '../../../core';
import { ExpenseFormComponent } from './expense-form.component';

describe('ExpenseFormComponent', () => {
  let fixture: ComponentFixture<ExpenseFormComponent>;
  let component: ExpenseFormComponent;
  let mockBudgetRepo: {
    createExpense: ReturnType<typeof vi.fn>;
    updateExpense: ReturnType<typeof vi.fn>;
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

  const mockExpense: ExpenseWithPayments = {
    id: 'exp-1',
    event_id: 'evt-1',
    category_id: 'cat-1',
    description: 'Bebidas para la fiesta',
    amount_cop: 200000,
    note: 'Comprar gaseosas y agua',
    task_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    payments: [
      {
        id: 'pay-1',
        event_id: 'evt-1',
        expense_id: 'exp-1',
        amount_cop: 80000,
        paid_on: '2026-10-15',
        paid_by_profile_id: 'prof-1',
        created_at: '2026-10-15T10:00:00Z',
      },
    ],
    task: null,
  };

  beforeEach(async () => {
    mockBudgetRepo = {
      createExpense: vi.fn().mockResolvedValue({ id: 'exp-new' }),
      updateExpense: vi.fn().mockResolvedValue({ id: 'exp-1' }),
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
      imports: [ExpenseFormComponent],
      providers: [
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'evt-1';
    component.categories = [...mockCategories];
  });

  it('valida campos obligatorios: descripción, categoría y monto', async () => {
    component.ngOnInit();
    fixture.detectChanges();

    await component.save();

    expect(component.descriptionError).toBe('La descripción es obligatoria.');
    expect(component.categoryError).toBe('Elige una categoría.');
    expect(component.amountError).toBe('Escribe un monto en números enteros, sin decimales.');
    expect(mockBudgetRepo.createExpense).not.toHaveBeenCalled();
  });

  it('valida que el monto esté en el rango permitido (entre $ 1 y $ 999.999.999)', async () => {
    component.ngOnInit();
    component.form.controls.description.setValue('Torta');
    component.form.controls.category_id.setValue('cat-1');
    component.form.controls.amount_cop.setValue('0');

    await component.save();

    expect(component.amountError).toBe('El monto debe estar entre $ 1 y $ 999.999.999.');
    expect(mockBudgetRepo.createExpense).not.toHaveBeenCalled();
  });

  it('al editar, valida que el monto no quede por debajo de lo ya pagado (amount_below_paid)', async () => {
    component.expense = mockExpense;
    component.ngOnInit();
    fixture.detectChanges();

    // El gasto tiene 80.000 pagados. Intentamos poner 50.000.
    component.form.controls.amount_cop.setValue('50000');

    await component.save();

    expect(component.amountError).toBe('El monto no puede ser menor que lo que ya se pagó.');
    expect(mockBudgetRepo.updateExpense).not.toHaveBeenCalled();
  });

  it('crea un gasto correctamente cuando los datos son válidos', async () => {
    component.ngOnInit();
    component.form.controls.description.setValue('Flores y centros de mesa');
    component.form.controls.category_id.setValue('cat-2');
    component.form.controls.amount_cop.setValue('150.000');
    component.form.controls.note.setValue('Rosas y margaritas');

    await component.save();

    expect(mockBudgetRepo.createExpense).toHaveBeenCalledWith('evt-1', {
      category_id: 'cat-2',
      description: 'Flores y centros de mesa',
      amount_cop: 150000,
      note: 'Rosas y margaritas',
    });
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ id: 'exp-new' }, 'saved');
  });

  it('edita un gasto existente correctamente', async () => {
    component.expense = mockExpense;
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.form.controls.description.value).toBe('Bebidas para la fiesta');
    expect(component.form.controls.amount_cop.value).toBe('200000');

    component.form.controls.amount_cop.setValue('220.000');

    await component.save();

    expect(mockBudgetRepo.updateExpense).toHaveBeenCalledWith('exp-1', {
      category_id: 'cat-1',
      description: 'Bebidas para la fiesta',
      amount_cop: 220000,
      note: 'Comprar gaseosas y agua',
    });
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ id: 'exp-1' }, 'saved');
  });

  it('muestra un toast de error si la creación falla y mantiene el formulario abierto', async () => {
    mockBudgetRepo.createExpense.mockRejectedValue(new Error('Fallo de conexión'));

    component.ngOnInit();
    component.form.controls.description.setValue('Torta');
    component.form.controls.category_id.setValue('cat-1');
    component.form.controls.amount_cop.setValue('100000');

    await component.save();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Fallo de conexión',
        color: 'danger',
      }),
    );
    expect(mockModalCtrl.dismiss).not.toHaveBeenCalledWith(expect.anything(), 'saved');
  });
});
