import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { BudgetRepository, TeamProfileRow, formatCop, toBogotaDateInput } from '../../../core';
import { DiscardGuard } from '../../invitaciones/formulario/discard-guard';
import { PaymentFormComponent, openPaymentForm } from './payment-form.component';

describe('PaymentFormComponent', () => {
  let fixture: ComponentFixture<PaymentFormComponent>;
  let component: PaymentFormComponent;
  let mockBudgetRepo: {
    addPayment: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: {
    dismiss: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

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
      id: 'prof-2',
      team_id: 'team-1',
      name: 'Laura',
      sort_order: 2,
      archived_at: null,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockBudgetRepo = {
      addPayment: vi.fn().mockResolvedValue({ id: 'pay-1' }),
    };
    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
      create: vi.fn(),
    };
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: 'destructive' }),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [PaymentFormComponent],
      providers: [
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: AlertController, useValue: mockAlertCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'event-1';
    component.expenseId = 'exp-1';
    component.balance = 250000;
    component.profiles = [...mockProfiles];
    component.canManageProfiles = true;
  });

  it('inicializa con saldo propuesto, fecha de hoy y form.dirty falso', () => {
    const dummyGuard: DiscardGuard = {
      hasChanges: () => false,
      canDismiss: vi.fn().mockResolvedValue(true),
    };
    component.discardGuard = dummyGuard;

    component.ngOnInit();
    fixture.detectChanges();

    expect(component.form.controls.amount_cop.value).toBe('250.000');
    expect(component.form.controls.paid_on.value).toBe(toBogotaDateInput(new Date()));
    expect(component.form.controls.paid_by_profile_id.value).toBe('');
    expect(component.form.dirty).toBe(false);
    expect(dummyGuard.hasChanges()).toBe(false);
  });

  it('valida que el monto no supere el tope (saldo que falta)', async () => {
    component.ngOnInit();
    component.balance = 100000;
    component.form.controls.amount_cop.setValue('150000');
    component.form.controls.paid_by_profile_id.setValue('prof-1');

    await component.save();

    expect(component.amountError).toBe(
      `El pago no puede superar los ${formatCop(100000)} que faltan.`,
    );
    expect(mockBudgetRepo.addPayment).not.toHaveBeenCalled();
  });

  it('valida que la fecha del pago no sea futura', async () => {
    component.ngOnInit();
    component.form.controls.amount_cop.setValue('50000');
    component.form.controls.paid_on.setValue('2099-12-31');
    component.form.controls.paid_by_profile_id.setValue('prof-1');

    await component.save();

    expect(component.paidOnError).toBe('La fecha del pago no puede ser futura.');
    expect(mockBudgetRepo.addPayment).not.toHaveBeenCalled();
  });

  it('valida que el perfil sea obligatorio', async () => {
    component.ngOnInit();
    component.form.controls.amount_cop.setValue('50000');
    component.form.controls.paid_by_profile_id.setValue('');

    await component.save();

    expect(component.profileError).toBe('Elige quién pagó.');
    expect(mockBudgetRepo.addPayment).not.toHaveBeenCalled();
  });

  it('muestra aviso y deshabilita guardar si no hay perfiles disponibles', async () => {
    component.profiles = [];
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.hasNoProfiles()).toBe(true);

    await component.save();
    expect(mockBudgetRepo.addPayment).not.toHaveBeenCalled();
  });

  it('permite ir a perfiles cuando no hay perfiles y canManageProfiles es true', async () => {
    component.profiles = [];
    component.canManageProfiles = true;
    component.ngOnInit();

    await component.goToProfiles();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'go-profiles');
  });

  it('guarda correctamente cuando los datos son válidos', async () => {
    component.ngOnInit();
    component.form.controls.amount_cop.setValue('50.000');
    component.form.controls.paid_by_profile_id.setValue('prof-1');

    await component.save();

    expect(mockBudgetRepo.addPayment).toHaveBeenCalledWith(
      expect.any(String),
      'event-1',
      {
        expense_id: 'exp-1',
        amount_cop: 50000,
        paid_on: component.today,
        paid_by_profile_id: 'prof-1',
      },
    );
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ id: 'pay-1' }, 'saved');
  });

  it('dos intentos de guardar después de un error envían el mismo id', async () => {
    mockBudgetRepo.addPayment.mockRejectedValueOnce(new Error('Fallo de red'));
    mockBudgetRepo.addPayment.mockResolvedValueOnce({ id: 'pay-1' });

    component.ngOnInit();
    component.form.controls.amount_cop.setValue('50.000');
    component.form.controls.paid_by_profile_id.setValue('prof-1');

    await component.save();
    expect(mockBudgetRepo.addPayment).toHaveBeenCalledTimes(1);
    const firstId = mockBudgetRepo.addPayment.mock.calls[0][0];
    expect(typeof firstId).toBe('string');
    expect(firstId.length).toBeGreaterThan(0);

    await component.save();
    expect(mockBudgetRepo.addPayment).toHaveBeenCalledTimes(2);
    const secondId = mockBudgetRepo.addPayment.mock.calls[1][0];
    expect(secondId).toBe(firstId);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ id: 'pay-1' }, 'saved');
  });

  describe('openPaymentForm helper', () => {
    it('abre el modal y retorna saved si fue guardado', async () => {
      const mockModalInstance = {
        present: vi.fn().mockResolvedValue(undefined),
        onWillDismiss: vi.fn().mockResolvedValue({ role: 'saved' }),
      };
      mockModalCtrl.create.mockResolvedValue(mockModalInstance);

      const result = await openPaymentForm(
        mockModalCtrl as unknown as ModalController,
        mockAlertCtrl as unknown as AlertController,
        mockRouter as unknown as Router,
        {
          eventId: 'evt-1',
          expenseId: 'exp-1',
          balance: 100000,
          profiles: mockProfiles,
          canManageProfiles: true,
        },
      );

      expect(mockModalCtrl.create).toHaveBeenCalled();
      expect(result).toBe('saved');
    });

    it('navega a perfiles y retorna null si el rol fue go-profiles', async () => {
      const mockModalInstance = {
        present: vi.fn().mockResolvedValue(undefined),
        onWillDismiss: vi.fn().mockResolvedValue({ role: 'go-profiles' }),
      };
      mockModalCtrl.create.mockResolvedValue(mockModalInstance);

      const result = await openPaymentForm(
        mockModalCtrl as unknown as ModalController,
        mockAlertCtrl as unknown as AlertController,
        mockRouter as unknown as Router,
        {
          eventId: 'evt-1',
          expenseId: 'exp-1',
          balance: 100000,
          profiles: mockProfiles,
          canManageProfiles: true,
        },
      );

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/eventos', 'evt-1', 'perfiles']);
      expect(result).toBeNull();
    });
  });
});
