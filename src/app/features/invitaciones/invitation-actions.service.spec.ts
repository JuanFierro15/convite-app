import { TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { InvitationsRepository } from '../../core';
import { InvitationActionsService } from './invitation-actions.service';

describe('InvitationActionsService', () => {
  let service: InvitationActionsService;
  let mockInvitationsRepo: { guestLink: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let mockAlertController: { create: ReturnType<typeof vi.fn> };
  let mockToastController: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockInvitationsRepo = {
      guestLink: vi.fn().mockReturnValue('https://convite.test/i/ABC1234'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockAlertController = {
      create: vi.fn(),
    };
    mockToastController = {
      create: vi.fn(),
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

  it('shares message with individual wording when kind is individual', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await service.shareWhatsApp(
      {
        kind: 'individual',
        group_name: 'Persona Ejemplo',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
      },
    );

    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('wa.me/573001234567');
    expect(decodeURIComponent(openedUrl)).toContain('Hola, Persona Ejemplo. Te invitamos');
    openSpy.mockRestore();
  });

  it('shares message with group wording when kind is group', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await service.shareWhatsApp(
      {
        kind: 'group',
        group_name: 'Familia Ejemplo',
        phone: '+573001234567',
        code: 'ABC1234',
      },
      {
        name: 'Celebración Familiar',
        starts_at: '2026-11-29T15:00:00-05:00',
      },
    );

    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(decodeURIComponent(openedUrl)).toContain('Hola, Familia Ejemplo. Queremos que nos acompañen en');
    openSpy.mockRestore();
  });
});
