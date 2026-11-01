import { TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { InvitationsRepository } from '../../core';
import { InvitationActionsService } from './invitation-actions.service';

describe('InvitationActionsService', () => {
  let service: InvitationActionsService;
  let mockInvitationsRepo: {
    guestLink: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    markWhatsAppSent: ReturnType<typeof vi.fn>;
  };
  let mockAlertController: { create: ReturnType<typeof vi.fn> };
  let mockToastController: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockInvitationsRepo = {
      guestLink: vi.fn().mockReturnValue('https://convite.test/i/ABC1234'),
      remove: vi.fn().mockResolvedValue(undefined),
      markWhatsAppSent: vi.fn().mockResolvedValue(undefined),
    };
    mockAlertController = {
      create: vi.fn(),
    };
    mockToastController = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        InvitationActionsService,
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: AlertController, useValue: mockAlertController },
        { provide: ToastController, useValue: mockToastController },
      ],
    });

    service = TestBed.inject(InvitationActionsService);
  });

  it('generates message with whatsAppMessage', () => {
    const msg = service.whatsAppMessage(
      {
        kind: 'individual',
        group_name: 'Persona Ejemplo',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
    );

    expect(msg).toContain('Hola, Persona Ejemplo.\n\nTe invitamos al *');
    expect(msg).toContain('https://convite.test/i/ABC1234');
  });

  it('shares message with individual wording when kind is individual and marks as sent', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const result = await service.shareWhatsApp(
      {
        id: 'inv-1',
        kind: 'individual',
        group_name: 'Persona Ejemplo',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
    );

    expect(result).toEqual({ opened: true, marked: true });
    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('wa.me/573001234567');
    expect(decodeURIComponent(openedUrl)).toContain('Hola, Persona Ejemplo.\n\nTe invitamos al *');
    expect(mockInvitationsRepo.markWhatsAppSent).toHaveBeenCalledWith('inv-1');
    openSpy.mockRestore();
  });

  it('shares message with group wording when kind is group and marks as sent', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const result = await service.shareWhatsApp(
      {
        id: 'inv-2',
        kind: 'group',
        group_name: 'Familia Ejemplo',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
    );

    expect(result).toEqual({ opened: true, marked: true });
    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('wa.me/573001234567');
    expect(decodeURIComponent(openedUrl)).toContain('Hola, familia Ejemplo.\n\nLos invitamos al *');
    expect(mockInvitationsRepo.markWhatsAppSent).toHaveBeenCalledWith('inv-2');
    openSpy.mockRestore();
  });

  it('returns false and does not mark when copied to clipboard (no phone, no share api)', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
      share: undefined,
    });

    const result = await service.shareWhatsApp(
      {
        id: 'inv-sin-tel',
        kind: 'group',
        group_name: 'Sin Teléfono',
        phone: null,
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
    );

    expect(result).toEqual({ opened: false, marked: false });
    expect(writeTextSpy).toHaveBeenCalled();
    expect(mockInvitationsRepo.markWhatsAppSent).not.toHaveBeenCalled();
    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Copiamos el mensaje para que lo compartas.',
        color: 'primary',
      }),
    );
  });

  it('shows warning toast and returns { opened: true, marked: false } if markWhatsAppSent fails by default', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockInvitationsRepo.markWhatsAppSent.mockRejectedValue(new Error('Network error'));

    const result = await service.shareWhatsApp(
      {
        id: 'inv-err',
        kind: 'individual',
        group_name: 'Prueba Error',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
    );

    expect(result).toEqual({ opened: true, marked: false });
    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Se abrió WhatsApp, pero no pudimos marcar la invitación como enviada.',
        color: 'warning',
      }),
    );
    openSpy.mockRestore();
  });

  it('does not show warning toast when notifyMarkFailure is false and mark fails', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockInvitationsRepo.markWhatsAppSent.mockRejectedValue(new Error('Network error'));

    const result = await service.shareWhatsApp(
      {
        id: 'inv-err-silent',
        kind: 'individual',
        group_name: 'Prueba Silenciosa',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
      { notifyMarkFailure: false },
    );

    expect(result).toEqual({ opened: true, marked: false });
    expect(mockToastController.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Se abrió WhatsApp, pero no pudimos marcar la invitación como enviada.',
      }),
    );
    openSpy.mockRestore();
  });

  it('passes toastAnchor to warning toast when notifyMarkFailure is true and mark fails', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockInvitationsRepo.markWhatsAppSent.mockRejectedValue(new Error('Network error'));

    await service.shareWhatsApp(
      {
        id: 'inv-err-anchor',
        kind: 'individual',
        group_name: 'Prueba Con Ancla',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
        rsvp_deadline: '2026-11-24T23:59:59-05:00',
      },
      { toastAnchor: 'invitation-send-footer' },
    );

    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Se abrió WhatsApp, pero no pudimos marcar la invitación como enviada.',
        color: 'warning',
        positionAnchor: 'invitation-send-footer',
      }),
    );
    openSpy.mockRestore();
  });

  describe('showToast y showError', () => {
    it('creates toast with positionAnchor when positionAnchor is provided to showToast', async () => {
      await service.showToast('Mensaje de prueba', 'primary', 'invitation-send-footer');

      expect(mockToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Mensaje de prueba',
          color: 'primary',
          position: 'bottom',
          positionAnchor: 'invitation-send-footer',
        }),
      );
    });

    it('creates toast without positionAnchor when positionAnchor is omitted', async () => {
      await service.showToast('Mensaje sin ancla', 'primary');

      const callArgs = mockToastController.create.mock.calls.at(-1)?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs).not.toHaveProperty('positionAnchor');
      expect(callArgs).toEqual({
        message: 'Mensaje sin ancla',
        duration: 3000,
        color: 'primary',
        position: 'bottom',
      });
    });

    it('passes positionAnchor from showError to showToast', async () => {
      await service.showError(new Error('Error con ancla'), 'invitation-send-footer');

      expect(mockToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error con ancla',
          color: 'danger',
          position: 'bottom',
          positionAnchor: 'invitation-send-footer',
        }),
      );
    });
  });

  describe('markSent', () => {
    it('returns true when markWhatsAppSent succeeds', async () => {
      mockInvitationsRepo.markWhatsAppSent.mockResolvedValue(undefined);

      const success = await service.markSent('inv-123');

      expect(success).toBe(true);
      expect(mockInvitationsRepo.markWhatsAppSent).toHaveBeenCalledWith('inv-123');
      expect(mockToastController.create).not.toHaveBeenCalled();
    });

    it('returns false and does not throw or show toast when markWhatsAppSent fails', async () => {
      mockInvitationsRepo.markWhatsAppSent.mockRejectedValue(new Error('DB error'));

      const success = await service.markSent('inv-fail');

      expect(success).toBe(false);
      expect(mockInvitationsRepo.markWhatsAppSent).toHaveBeenCalledWith('inv-fail');
      expect(mockToastController.create).not.toHaveBeenCalled();
    });
  });
});
