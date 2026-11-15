import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController } from '@ionic/angular';
import {
  EventContextService,
  InvitationBatchRow,
  InvitationBatchesRepository,
} from '../../../core';
import { BatchFormComponent } from './batch-form.component';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('BatchFormComponent', () => {
  let fixture: ComponentFixture<BatchFormComponent>;
  let component: BatchFormComponent;
  let mockBatchesRepo: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockEventContext: {
    batches: ReturnType<typeof signal<InvitationBatchRow[]>>;
  };
  let mockModalCtrl: {
    dismiss: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastPresent: ReturnType<typeof vi.fn>;

  const sampleBatch: InvitationBatchRow = {
    id: 'batch-1',
    event_id: 'evt-1',
    name: 'Segunda tanda',
    rsvp_deadline: '2026-11-20T23:59:59-05:00',
    created_at: '2026-10-10T00:00:00-05:00',
  };

  beforeEach(async () => {
    mockBatchesRepo = {
      create: vi.fn().mockImplementation(async (eventId: string, id: string, input) => ({
        id,
        event_id: eventId,
        name: input.name,
        rsvp_deadline: input.rsvp_deadline,
        created_at: '2026-10-15T00:00:00-05:00',
      })),
      update: vi.fn().mockImplementation(async (id: string, input) => ({
        id,
        event_id: 'evt-1',
        name: input.name,
        rsvp_deadline: input.rsvp_deadline,
        created_at: '2026-10-10T00:00:00-05:00',
      })),
    };

    mockEventContext = {
      batches: signal<InvitationBatchRow[]>([]),
    };

    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };

    mockToastPresent = vi.fn().mockResolvedValue(undefined);
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: mockToastPresent,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [BatchFormComponent],
      providers: [
        { provide: InvitationBatchesRepository, useValue: mockBatchesRepo },
        { provide: EventContextService, useValue: mockEventContext },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BatchFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'evt-1';
    component.eventStartsAt = '2026-11-29T23:59:59-05:00';
  });

  async function initComponent(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('sugiere "Segunda tanda" cuando hay 0 tandas, "Tercera tanda" cuando hay 1 y vacío desde 2', () => {
    component.existingBatchCount = 0;
    component.ngOnInit();
    expect(component.form.controls.name.value).toBe('Segunda tanda');

    component.existingBatchCount = 1;
    component.ngOnInit();
    expect(component.form.controls.name.value).toBe('Tercera tanda');

    component.existingBatchCount = 2;
    component.ngOnInit();
    expect(component.form.controls.name.value).toBe('');

    component.existingBatchCount = 3;
    component.ngOnInit();
    expect(component.form.controls.name.value).toBe('');
  });

  it('precarga nombre y fecha en modo edición', async () => {
    component.batch = sampleBatch;
    await initComponent();

    expect(component.isEditing()).toBe(true);
    expect(component.form.controls.name.value).toBe('Segunda tanda');
    expect(component.form.controls.rsvp_deadline.value).toBe('2026-11-20');
    const title = (fixture.nativeElement as HTMLElement).querySelector('ion-title');
    expect(title?.textContent?.trim()).toBe('Editar tanda');
  });

  it('no guarda si el nombre está en blanco o tiene 61 caracteres, pero permite 60 caracteres', async () => {
    await initComponent();
    component.form.controls.rsvp_deadline.setValue('2026-11-20');

    component.form.controls.name.setValue('   ');
    await component.save();
    fixture.detectChanges();
    expect(component.nameError).toBe('El nombre de la tanda es obligatorio.');
    expect(mockBatchesRepo.create).not.toHaveBeenCalled();

    component.form.controls.name.setValue('a'.repeat(61));
    await component.save();
    fixture.detectChanges();
    expect(component.nameError).toBe('El nombre no puede superar los 60 caracteres.');
    expect(mockBatchesRepo.create).not.toHaveBeenCalled();

    component.form.controls.name.setValue('a'.repeat(60));
    await component.save();
    expect(mockBatchesRepo.create).toHaveBeenCalledTimes(1);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a'.repeat(60) }),
      'saved',
    );
  });

  it('permite fecha igual al día del evento y rechaza un día después con el texto exacto', async () => {
    component.eventStartsAt = '2026-11-29T23:59:59-05:00';
    await initComponent();
    component.form.controls.name.setValue('Última tanda');

    component.form.controls.rsvp_deadline.setValue('2026-11-30');
    await component.save();
    fixture.detectChanges();

    expect(component.deadlineError).toBe(
      'La fecha límite debe ser antes del día del evento.',
    );
    const errorEl = (fixture.nativeElement as HTMLElement).querySelector(
      '.form-field__error',
    );
    expect(errorEl?.textContent?.trim()).toBe(
      'La fecha límite debe ser antes del día del evento.',
    );
    expect(mockBatchesRepo.create).not.toHaveBeenCalled();

    component.form.controls.rsvp_deadline.setValue('2026-11-29');
    await component.save();

    expect(mockBatchesRepo.create).toHaveBeenCalledWith(
      'evt-1',
      expect.any(String),
      {
        name: 'Última tanda',
        rsvp_deadline: '2026-11-29T23:59:59-05:00',
      },
    );
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(expect.anything(), 'saved');
  });

  it('evita doble guardado cuando se hace doble clic en Guardar', async () => {
    const deferred = createDeferred<InvitationBatchRow>();
    mockBatchesRepo.create.mockReturnValueOnce(deferred.promise);

    await initComponent();
    component.form.controls.name.setValue('Segunda tanda');
    component.form.controls.rsvp_deadline.setValue('2026-11-20');
    fixture.detectChanges();

    const savePromise1 = component.save();
    fixture.detectChanges();
    const saveButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-button'),
    ).find((btn) => btn.textContent?.includes('Guardar')) as HTMLIonButtonElement | undefined;
    expect(component.saving()).toBe(true);
    expect(saveButton?.disabled || saveButton?.hasAttribute('disabled')).toBe(true);

    const savePromise2 = component.save();
    expect(mockBatchesRepo.create).toHaveBeenCalledTimes(1);

    deferred.resolve(sampleBatch);
    await Promise.all([savePromise1, savePromise2]);
    expect(component.saving()).toBe(false);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(sampleBatch, 'saved');
  });

  it('muestra toast con el mensaje de error, mantiene el modal abierto y reutiliza el mismo id al reintentar', async () => {
    mockBatchesRepo.create.mockRejectedValueOnce(
      new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'),
    );

    await initComponent();
    component.form.controls.name.setValue('Tanda de prueba');
    component.form.controls.rsvp_deadline.setValue('2026-11-20');

    await component.save();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
        color: 'danger',
      }),
    );
    expect(mockToastPresent).toHaveBeenCalled();
    expect(mockModalCtrl.dismiss).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
    expect(component.form.controls.name.value).toBe('Tanda de prueba');
    expect(component.form.controls.rsvp_deadline.value).toBe('2026-11-20');

    const firstId = mockBatchesRepo.create.mock.calls[0][1] as string;
    expect(firstId).toBeTruthy();

    await component.save();
    const secondId = mockBatchesRepo.create.mock.calls[1][1] as string;
    expect(secondId).toBe(firstId);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: firstId, name: 'Tanda de prueba' }),
      'saved',
    );
  });

  it('actualiza la tanda existente al guardar en modo edición', async () => {
    component.batch = sampleBatch;
    await initComponent();
    component.form.controls.name.setValue('Tanda ajustada');
    component.form.controls.rsvp_deadline.setValue('2026-11-22');

    await component.save();

    expect(mockBatchesRepo.update).toHaveBeenCalledWith('batch-1', {
      name: 'Tanda ajustada',
      rsvp_deadline: '2026-11-22T23:59:59-05:00',
    });
    expect(mockBatchesRepo.create).not.toHaveBeenCalled();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'batch-1', name: 'Tanda ajustada' }),
      'saved',
    );
  });

  it('cierra el modal con rol cancel al cancelar', async () => {
    await initComponent();
    await component.cancel();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
