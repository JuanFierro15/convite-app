import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, IonInput, ModalController } from '@ionic/angular';
import { InvitationsRepository } from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';
import { InvitationFormComponent } from './invitation-form.component';

describe('InvitationFormComponent', () => {
  let fixture: ComponentFixture<InvitationFormComponent>;
  let component: InvitationFormComponent;
  let mockInvitationsRepo: {
    save: ReturnType<typeof vi.fn>;
    findPhoneInEvent: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: { dismiss: ReturnType<typeof vi.fn> };
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockActionsService: { showError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();

    mockInvitationsRepo = {
      save: vi.fn().mockResolvedValue({
        id: 'inv-1',
        event_id: 'event-1',
        group_name: 'Familia Ejemplo',
        kind: 'group',
        phone: null,
        code: 'CODE123',
        created_at: '2026-10-25T00:00:00Z',
        updated_at: '2026-10-25T00:00:00Z',
        guests: [],
      }),
      findPhoneInEvent: vi.fn().mockResolvedValue([]),
    };
    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };
    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
      }),
    };
    mockActionsService = {
      showError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InvitationFormComponent],
      providers: [
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: InvitationActionsService, useValue: mockActionsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationFormComponent);
    component = fixture.componentInstance;
    component.eventId = 'event-1';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes in group mode by default with one empty guest row', () => {
    component.ngOnInit();
    expect(component.kind()).toBe('group');
    expect(component.form.controls.kind.value).toBe('group');
    expect(component.guestsArray.length).toBe(1);
    expect(component.guestsArray.enabled).toBe(true);
    expect(component.phoneStatus()).toBe('empty');
  });

  it('initializes in individual mode when editing an individual invitation', () => {
    component.invitation = {
      id: 'inv-ind',
      event_id: 'event-1',
      group_name: 'Persona Ejemplo',
      kind: 'individual',
      phone: '+573001234567',
      code: 'IND123',
      created_at: '2026-10-25T00:00:00Z',
      updated_at: '2026-10-25T00:00:00Z',
      whatsapp_sent_at: null,
      guests: [
        {
          id: 'guest-1',
          invitation_id: 'inv-ind',
          event_id: 'event-1',
          full_name: 'Persona Ejemplo',
          rsvp: 'pending',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 0,
          created_at: '2026-10-25T00:00:00Z',
        },
      ],
    };

    component.ngOnInit();
    expect(component.kind()).toBe('individual');
    expect(component.guestsArray.disabled).toBe(true);
    expect(component.form.controls.phone.value).toBe('+57 300 123 4567');
    expect(component.phoneStatus()).toBe('valid');
  });

  it('copies single guest name to group_name when switching group -> individual if name is empty', () => {
    component.ngOnInit();
    component.form.controls.group_name.setValue('');
    component.guestsArray.at(0).controls.full_name.setValue('Persona Ejemplo');

    component.setKind('individual');

    expect(component.kind()).toBe('individual');
    expect(component.form.controls.group_name.value).toBe('Persona Ejemplo');
    expect(component.guestsArray.disabled).toBe(true);
  });

  it('populates empty guest row with group_name when switching individual -> group', () => {
    component.ngOnInit();
    component.setKind('individual');
    component.form.controls.group_name.setValue('Persona Ejemplo');
    component.guestsArray.at(0).controls.full_name.setValue('');

    component.setKind('group');

    expect(component.kind()).toBe('group');
    expect(component.guestsArray.enabled).toBe(true);
    expect(component.guestsArray.at(0).controls.full_name.value).toBe('Persona Ejemplo');
  });

  it('formats raw phone input live and updates status', async () => {
    component.ngOnInit();

    const mockNativeInput = {
      value: '3001234567',
      selectionStart: 10,
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement;

    const mockIonInput = {
      getInputElement: vi.fn().mockResolvedValue(mockNativeInput),
    } as unknown as IonInput;

    await component.onPhoneInput(mockIonInput);

    expect(component.form.controls.phone.value).toBe('+57 300 123 4567');
    expect(component.phoneStatus()).toBe('valid');
    expect(component.isSaveDisabled()).toBe(false);
  });

  it('disables save when phone is invalid', async () => {
    component.ngOnInit();

    const mockNativeInput = {
      value: '2001234567',
      selectionStart: 10,
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement;

    const mockIonInput = {
      getInputElement: vi.fn().mockResolvedValue(mockNativeInput),
    } as unknown as IonInput;

    await component.onPhoneInput(mockIonInput);

    expect(component.phoneStatus()).toBe('not_mobile');
    expect(component.isSaveDisabled()).toBe(true);
    expect(component.showPhoneError()).toBe(true);
    expect(component.phoneErrorText()).toBe('El celular debe empezar por 3.');
  });

  it('checks for duplicate phone with 400ms debounce when valid', async () => {
    component.ngOnInit();
    mockInvitationsRepo.findPhoneInEvent.mockResolvedValue(['Familia Vecina']);

    const mockNativeInput = {
      value: '3001234567',
      selectionStart: 10,
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement;

    const mockIonInput = {
      getInputElement: vi.fn().mockResolvedValue(mockNativeInput),
    } as unknown as IonInput;

    await component.onPhoneInput(mockIonInput);

    expect(mockInvitationsRepo.findPhoneInEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    await Promise.resolve();

    expect(mockInvitationsRepo.findPhoneInEvent).toHaveBeenCalledWith(
      'event-1',
      '+573001234567',
      undefined,
    );
    expect(component.duplicatePhoneWarning()).toBe(
      'Este número ya está en la invitación de Familia Vecina.',
    );
  });

  it('saves individual invitation with stable first guest id and single guest payload', async () => {
    component.ngOnInit();
    component.setKind('individual');
    component.form.controls.group_name.setValue('Persona Ejemplo');

    const firstGuestId = component.guestsArray.at(0).controls.id.value;

    await component.save();

    expect(mockInvitationsRepo.save).toHaveBeenCalledWith(
      'event-1',
      expect.any(String),
      {
        kind: 'individual',
        group_name: 'Persona Ejemplo',
        phone: null,
        guests: [{ id: firstGuestId, full_name: 'Persona Ejemplo' }],
      },
    );
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(expect.anything(), 'saved');
  });

  it('confirms with alert before saving individual invitation if multiple named guests were present', async () => {
    component.ngOnInit();
    component.guestsArray.at(0).controls.full_name.setValue('Persona Uno');
    component.addGuest();
    component.guestsArray.at(1).controls.full_name.setValue('Persona Dos');

    component.setKind('individual');
    component.form.controls.group_name.setValue('Persona Uno');

    await component.save();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Invitación individual',
        message:
          'Esta invitación tiene 2 personas. Como invitación individual quedará solo Persona Uno. ¿Continuar?',
      }),
    );
    expect(mockInvitationsRepo.save).toHaveBeenCalled();
  });

  it('aborts saving individual invitation when alert is cancelled', async () => {
    mockAlertCtrl.create.mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    });

    component.ngOnInit();
    component.guestsArray.at(0).controls.full_name.setValue('Persona Uno');
    component.addGuest();
    component.guestsArray.at(1).controls.full_name.setValue('Persona Dos');

    component.setKind('individual');
    component.form.controls.group_name.setValue('Persona Uno');

    await component.save();

    expect(mockAlertCtrl.create).toHaveBeenCalled();
    expect(mockInvitationsRepo.save).not.toHaveBeenCalled();
  });
});
