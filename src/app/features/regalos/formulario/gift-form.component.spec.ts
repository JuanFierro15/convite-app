import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ModalController, ToastController } from '@ionic/angular';
import { GiftWithReservations, GiftsRepository } from '../../../core';
import { GiftFormComponent } from './gift-form.component';

describe('GiftFormComponent', () => {
  let fixture: ComponentFixture<GiftFormComponent>;
  let component: GiftFormComponent;
  let mockGiftsRepo: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: {
    dismiss: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockGiftsRepo = {
      create: vi.fn().mockResolvedValue({ id: 'gift-1' }),
      update: vi.fn().mockResolvedValue({ id: 'gift-1' }),
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
      imports: [GiftFormComponent],
      providers: [
        { provide: GiftsRepository, useValue: mockGiftsRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GiftFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'event-1';
  });

  it('el campo límite de familias no aparece con tipo unique ni free y aparece con repeatable', () => {
    component.ngOnInit();
    fixture.detectChanges();

    // Default kind is 'unique'
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    // Switch to 'free'
    component.form.controls.kind.setValue('free');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    // Switch to 'repeatable'
    component.form.controls.kind.setValue('repeatable');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).not.toBeNull();
  });

  it('guardar un repetible con 10 llama a create con max_reservations: 10; vacío, con null', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Pañales etapa 1');
    component.form.controls.kind.setValue('repeatable');
    component.form.controls.maxReservations.setValue('10');

    await component.save();

    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        name: 'Pañales etapa 1',
        kind: 'repeatable',
        max_reservations: 10,
      }),
    );

    mockGiftsRepo.create.mockClear();
    component.form.controls.maxReservations.setValue('   ');
    await component.save();

    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        name: 'Pañales etapa 1',
        kind: 'repeatable',
        max_reservations: null,
      }),
    );
  });

  it('guardar un único envía max_reservations: null aunque el campo tuviera un número escrito antes de cambiar el tipo', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Cuna para bebé');
    component.form.controls.kind.setValue('repeatable');
    component.form.controls.maxReservations.setValue('10');

    // Cambiar a unique antes de guardar
    component.form.controls.kind.setValue('unique');

    await component.save();

    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        name: 'Cuna para bebé',
        kind: 'unique',
        max_reservations: null,
      }),
    );
  });

  it('0, -1 y 2.5 muestran el error y no llaman al repositorio', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Pañales');
    component.form.controls.kind.setValue('repeatable');

    for (const invalidValue of ['0', '-1', '2.5']) {
      mockGiftsRepo.create.mockClear();
      component.form.controls.maxReservations.setValue(invalidValue);
      await component.save();

      expect(component.maxReservationsError).toBe(
        'Escribe un número entero de 1 en adelante o déjalo vacío.',
      );
      expect(mockGiftsRepo.create).not.toHaveBeenCalled();
    }
  });

  it('al editar un regalo con 3 reservas, 2 muestra error y 3 guarda', async () => {
    const mockGift: GiftWithReservations = {
      id: 'gift-rep-1',
      event_id: 'event-1',
      name: 'Pañitos húmedos',
      description: null,
      category: null,
      kind: 'repeatable',
      max_reservations: 5,
      sort_order: 1,
      created_at: '2026-10-25T00:00:00Z',
      reservations: [
        {
          id: 'res-1',
          invitation_id: 'inv-1',
          group_name: 'Familia Uno',
          created_at: '2026-10-25T01:00:00Z',
        },
        {
          id: 'res-2',
          invitation_id: 'inv-2',
          group_name: 'Familia Dos',
          created_at: '2026-10-25T02:00:00Z',
        },
        {
          id: 'res-3',
          invitation_id: 'inv-3',
          group_name: 'Familia Tres',
          created_at: '2026-10-25T03:00:00Z',
        },
      ],
    };

    component.gift = mockGift;
    component.ngOnInit();
    expect(component.form.controls.maxReservations.value).toBe('5');

    // Probar con 2 (menor que 3 reservas existentes)
    component.form.controls.maxReservations.setValue('2');
    await component.save();

    expect(component.maxReservationsError).toBe(
      'Ya hay 3 familias con este regalo. El límite no puede ser menor.',
    );
    expect(mockGiftsRepo.update).not.toHaveBeenCalled();

    // Probar con 3 (igual a 3 reservas existentes)
    component.form.controls.maxReservations.setValue('3');
    await component.save();

    expect(component.maxReservationsError).toBeNull();
    expect(mockGiftsRepo.update).toHaveBeenCalledWith(
      'gift-rep-1',
      expect.objectContaining({
        name: 'Pañitos húmedos',
        kind: 'repeatable',
        max_reservations: 3,
      }),
    );
  });
});
