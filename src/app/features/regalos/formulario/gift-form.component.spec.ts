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

    // Default kind is 'unique'
    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).toBeNull();

    // Switch to 'suggestion'
    component.form.controls.kind.setValue('suggestion');
    fixture.detectChanges();
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

  it('en repetible: vacío, 1, "abc" muestran error y no guardan; 2 es válido y guarda', async () => {
    component.ngOnInit();
    component.form.controls.name.setValue('Pañales');
    component.form.controls.kind.setValue('repeatable');

    // Vacío
    component.form.controls.maxReservations.setValue('');
    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    // Con espacios en blanco
    component.form.controls.maxReservations.setValue('   ');
    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    // 1
    component.form.controls.maxReservations.setValue('1');
    await component.save();
    expect(component.maxReservationsError).toBe('Si solo una familia puede elegirlo, usa Único.');
    expect(mockGiftsRepo.create).not.toHaveBeenCalled();

    // No es entero positivo ("abc", "0", "-1", "2.5")
    for (const invalid of ['abc', '0', '-1', '2.5']) {
      component.form.controls.maxReservations.setValue(invalid);
      await component.save();
      expect(component.maxReservationsError).toBe('Escribe un número entero de 2 en adelante.');
      expect(mockGiftsRepo.create).not.toHaveBeenCalled();
    }

    // 2 (válido)
    component.form.controls.maxReservations.setValue('2');
    await component.save();
    expect(component.maxReservationsError).toBeNull();
    expect(mockGiftsRepo.create).toHaveBeenCalledWith(
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
      'event-1',
      expect.objectContaining({
        name: 'Lluvia de sobres',
        kind: 'suggestion',
        max_reservations: null,
      }),
    );
  });

  it('la opción libre se oculta si el evento ya tiene uno y se ve al editar el libre', () => {
    // Caso 1: evento no tiene libre -> opción visible
    component.hasFreeGift = false;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="free"]'))).not.toBeNull();

    // Caso 2: evento ya tiene libre -> opción oculta
    component.hasFreeGift = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="free"]'))).toBeNull();

    // Caso 3: editando el regalo libre existente con hasFreeGift = true -> opción visible
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

    // El campo aparece vacío
    expect(component.form.controls.maxReservations.value).toBe('');

    // Cambiar a repetible
    component.form.controls.kind.setValue('repeatable');
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#gift-max-reservations-label'))).not.toBeNull();
    expect(component.form.controls.maxReservations.value).toBe('');

    // Guardar vacío exige el número
    await component.save();
    expect(component.maxReservationsError).toBe(
      'Escribe cuántas familias pueden elegirlo (2 o más).',
    );
    expect(mockGiftsRepo.update).not.toHaveBeenCalled();

    // Poner 3 guarda exitosamente
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

  it('el radio "Lluvia de sobres" aparece sin hasEnvelopeGift, no aparece con hasEnvelopeGift = true, y sí aparece al editar un envelope aunque hasEnvelopeGift = true', () => {
    // Caso 1: sin hasEnvelopeGift -> opción visible
    component.hasEnvelopeGift = false;
    component.ngOnInit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="envelope"]'))).not.toBeNull();

    // Caso 2: con hasEnvelopeGift = true -> opción oculta
    component.hasEnvelopeGift = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ion-radio[value="envelope"]'))).toBeNull();

    // Caso 3: editando un envelope aunque hasEnvelopeGift = true -> opción visible
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

    // Categoría no se muestra
    expect(fixture.debugElement.query(By.css('#gift-category-label'))).toBeNull();

    // Etiqueta de descripción es "Texto que verán los invitados"
    const descLabel = fixture.debugElement.query(By.css('#gift-description-label'));
    expect(descLabel).not.toBeNull();
    expect(descLabel.nativeElement.textContent.trim()).toBe('Texto que verán los invitados');

    // Placeholder es "Opcional"
    const textarea = fixture.debugElement.query(By.css('ion-textarea[formControlName="description"]'));
    expect(textarea).not.toBeNull();
    expect(
      textarea.attributes['placeholder'] ??
        textarea.nativeElement.getAttribute('placeholder') ??
        textarea.nativeElement.placeholder,
    ).toBe('Opcional');

    // Ayuda debajo aparece
    const helps = fixture.debugElement.queryAll(By.css('.field-help'));
    const envelopeHelp = helps.find((h) =>
      h.nativeElement.textContent.includes('Si lo dejas vacío, verán: «Si prefieren hacer un aporte en sobre'),
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
      'event-1',
      expect.objectContaining({
        name: 'Lluvia de sobres',
        kind: 'envelope',
        max_reservations: null,
        category: null,
      }),
    );
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
