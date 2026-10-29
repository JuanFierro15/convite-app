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

    expect(result).toBe(true);
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

    expect(result).toBe(true);
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

    expect(result).toBe(false);
    expect(writeTextSpy).toHaveBeenCalled();
    expect(mockInvitationsRepo.markWhatsAppSent).not.toHaveBeenCalled();
    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Copiamos el mensaje para que lo compartas.',
        color: 'primary',
      }),
    );
  });

  it('shows warning toast and still returns true if markWhatsAppSent fails', async () => {
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

    expect(result).toBe(true);
    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Se abrió WhatsApp, pero no pudimos marcar la invitación como enviada.',
        color: 'warning',
      }),
    );
    openSpy.mockRestore();
  });
});
