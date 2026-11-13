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

  it('el campo número de familias no aparece con tipo unique, free ni suggestion y aparece con repeatable', () => {
    component.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    component.form.controls.kind.setValue('suggestion');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    component.form.controls.kind.setValue('free');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    component.form.controls.kind.setValue('repeatable');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).not.toBeNull();
  });

  it('en repetible: vacío, 1, "abc" muestran error y no guardan; 2 es válido y guarda', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Pañales');
    component.form.controls.kind.setValue('repeatable');

    component.form.controls.maxReservations.setValue('');
    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    component.form.controls.maxReservations.setValue('   ');
    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    component.form.controls.maxReservations.setValue('1');
    await component.save();
    expect(component.maxReservationsError).toBe('Si solo una familia puede elegirlo, usa Único.');
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    for (const invalid of ['abc', '0', '-1', '2.5']) {
      component.form.controls.maxReservations.setValue(invalid);
      await component.save();
      expect(component.maxReservationsError).toBe('Escribe un número entero de 2 en adelante.');
      expect(mockGiftsRepo.create).not.toHaveBeenCalled();
    }

    component.form.controls.maxReservations.setValue('2');
    await component.save();
    expect(component.maxReservationsError).toBeNull();
    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      'event-1',
      expect.objectContaining({
        name: 'Pañales',
        kind: 'repeatable',
        max_reservations: 2,
      }),
    );
  });

  it('sugerencia guarda con max_reservations: null y sin campo visible', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Lluvia de sobres');
    component.form.controls.kind.setValue('suggestion');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    await component.save();

    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      'event-1',
      expect.objectContaining({
        name: 'Lluvia de sobres',
        kind: 'suggestion',
        max_reservations: null,
      }),
    );
  });

  it('la opción libre se oculta si el evento ya tiene uno y se ve al editar el libre', () => {
    component.hasFreeGift = false;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="free"]'))).not.toBeNull();

    component.hasFreeGift = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="free"]'))).toBeNull();

    const mockFreeGift: GiftWithReservations = {
      id: 'gift-free-1',
      event_id: 'event-1',
      name: 'Regalo libre',
      description: null,
      category: null,
      kind: 'free',
      max_reservations: null,
      sort_order: 3,
      created_at: '2026-10-25T00:00:00Z',
      reservations: [],
    };
    component.gift = mockFreeGift;
    component.hasFreeGift = true;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="free"]'))).not.toBeNull();
  });

  it('tipo bloqueado muestra radios deshabilitados y el aviso con el texto nuevo', () => {
    const mockGiftWithReservations: GiftWithReservations = {
      id: 'gift-uniq-1',
      event_id: 'event-1',
      name: 'Coche paseador',
      description: null,
      category: null,
      kind: 'unique',
      max_reservations: null,
      sort_order: 1,
      created_at: '2026-10-25T00:00:00Z',
      reservations: [
        {
          id: 'res-1',
          created_at: '2026-10-25T01:00:00Z',
        },
      ],
    };

    component.gift = mockGiftWithReservations;
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.isTypeLocked()).toBe(true);

    const noticeEl = fixture.debugElement.query(By.css('.field-notice'));
    expect(noticeEl).not.toBeNull();
    expect(noticeEl.nativeElement.textContent.trim()).toBe(
      'Ya hay familias que eligieron este regalo, así que no puedes cambiar su tipo. Una sugerencia no se reserva y esas elecciones se perderían.',
    );

    const radios = fixture.debugElement.queryAll(By.css('ion-radio'));
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      const isDisabled =
        radio.componentInstance?.disabled === true ||
        radio.nativeElement.disabled === true ||
        radio.nativeElement.getAttribute('disabled') !== null ||
        radio.attributes['disabled'] === 'true' ||
        radio.attributes['ng-reflect-disabled'] === 'true';
      expect(isDisabled).toBe(true);
    }
  });

  it('editar una sugerencia y pasarla a repetible exige el número de familias', async () => {
    const mockSuggestion: GiftWithReservations = {
      id: 'gift-sug-1',
      event_id: 'event-1',
      name: 'Pañitos húmedos',
      description: null,
      category: null,
      kind: 'suggestion',
      max_reservations: null,
      sort_order: 2,
      created_at: '2026-10-25T00:00:00Z',
      reservations: [],
    };

    component.gift = mockSuggestion;
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.form.controls.maxReservations.value).toBe('');

    component.form.controls.kind.setValue('repeatable');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).not.toBeNull();
    expect(component.form.controls.maxReservations.value).toBe('');

    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.update).not.toHaveBeenCalled();

    component.form.controls.maxReservations.setValue('3');
    await component.save();
    expect(component.maxReservationsError).toBeNull();
    expect(mockGiftsRepo.update).toHaveBeenCalledWith(
      'gift-sug-1',
      expect.objectContaining({
        name: 'Pañitos húmedos',
        kind: 'repeatable',
        max_reservations: 3,
      }),
    );
  });

  it('al editar un repetible con reservas, menor que las reservas muestra error y mayor o igual guarda', async () => {
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
          created_at: '2026-10-25T01:00:00Z',
        },
        {
          id: 'res-2',
          created_at: '2026-10-25T02:00:00Z',
        },
        {
          id: 'res-3',
          created_at: '2026-10-25T03:00:00Z',
        },
      ],
    };

    component.gift = mockGift;
    component.ngOnInit();
    expect(component.form.controls.maxReservations.value).toBe('5');

    component.form.controls.maxReservations.setValue('2');
    await component.save();

    expect(component.maxReservationsError).toBe(
      'Ya hay 3 familias con este regalo. El límite no puede ser menor.',
    );
    expect(mockGiftsRepo.update).not.toHaveBeenCalled();

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

  it('el radio "Lluvia de sobres" aparece sin hasEnvelopeGift, no aparece con hasEnvelopeGift = true, y sí aparece al editar un envelope aunque hasEnvelopeGift = true', () => {
    component.hasEnvelopeGift = false;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="envelope"]'))).not.toBeNull();

    component.hasEnvelopeGift = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="envelope"]'))).toBeNull();

    const mockEnvelopeGift: GiftWithReservations = {
      id: 'gift-env-1',
      event_id: 'event-1',
      name: 'Lluvia de sobres',
      description: null,
      category: null,
      kind: 'envelope',
      max_reservations: null,
      sort_order: 0,
      created_at: '2026-10-25T00:00:00Z',
      reservations: [],
    };
    component.gift = mockEnvelopeGift;
    component.hasEnvelopeGift = true;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="envelope"]'))).not.toBeNull();
  });

  it('con envelope elegido, la etiqueta "Texto que verán los invitados" y su ayuda aparecen y "Categoría" no', () => {
    component.ngOnInit();
    component.form.controls.kind.setValue('envelope');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#gift-category-label'))).toBeNull();

    const descLabel = fixture.debugElement.query(By.css('#gift-description-label'));
    expect(descLabel).not.toBeNull();
    expect(descLabel.nativeElement.textContent.trim()).toBe('Texto que verán los invitados');

    const textarea = fixture.debugElement.query(By.css('ion-textarea[formControlName="description"]'));
    expect(textarea).not.toBeNull();
    expect(
      textarea.attributes['placeholder'] ??
        textarea.nativeElement.getAttribute('placeholder') ??
        textarea.nativeElement.placeholder,
    ).toBe('Opcional');

    const helps = fixture.debugElement.queryAll(By.css('.field-help'));
    const envelopeHelp = helps.find((h) =>
      h.nativeElement.textContent.includes('Si lo dejas vacío, los invitados solo verán el título y la ilustración.'),
    );
    expect(envelopeHelp).toBeTruthy();
  });

  it('guardar un envelope llama a create con kind: \'envelope\', max_reservations: null y category: null', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Lluvia de sobres');
    component.form.controls.kind.setValue('envelope');
    component.form.controls.category.setValue('Cualquiera');
    component.form.controls.maxReservations.setValue('5');
    fixture.detectChanges();

    await component.save();

    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      'event-1',
      expect.objectContaining({
        name: 'Lluvia de sobres',
        kind: 'envelope',
        max_reservations: null,
        category: null,
      }),
    );
  });

  it('dos intentos de guardar después de un error envían el mismo id', async () => {
    mockGiftsRepo.create.mockRejectedValueOnce(new Error('Fallo de red'));
    mockGiftsRepo.create.mockResolvedValueOnce({ id: 'gift-1' });

    component.ngOnInit();
    component.form.controls.name.setValue('Cuna');
    component.form.controls.kind.setValue('unique');
    fixture.detectChanges();

    await component.save();
    expect(mockGiftsRepo.create).toHaveBeenCalledTimes(1);
    const firstId = mockGiftsRepo.create.mock.calls[0][0];
    expect(typeof firstId).toBe('string');
    expect(firstId.length).toBeGreaterThan(0);

    await component.save();
    expect(mockGiftsRepo.create).toHaveBeenCalledTimes(2);
    const secondId = mockGiftsRepo.create.mock.calls[1][0];
    expect(secondId).toBe(firstId);
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ id: 'gift-1' }, 'saved');
  });

  it('con hasEnvelopeGift = true y envelope forzado en el control, no guarda', async () => {
    component.hasEnvelopeGift = true;
    component.ngOnInit();
    component.form.controls.name.setValue('Lluvia de sobres');
    component.form.controls.kind.setValue('envelope');
    fixture.detectChanges();

    await component.save();

    expect(mockGiftsRepo.create).not.toHaveBeenCalled();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'El evento ya tiene una lluvia de sobres.',
      }),
    );
  });
});
