import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import {
  GuestApiService,
  GuestGift,
  GuestInvitation,
} from '../../../core';
import { GuestGiftsPage } from './guest-gifts.page';

const mockGroupInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-group-1',
    group_name: 'Familia Gómez',
    code: 'ABCD1234JK',
    kind: 'group',
  },
  event: {
    name: 'Baby Shower de Martina',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [{ id: 'g-1', full_name: 'Carlos Gómez', rsvp: 'accepted' }],
  can_respond: true,
  gifts_open: true,
};

const mockIndividualInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-ind-1',
    group_name: 'Laura Peña',
    code: 'WXYZ5678LM',
    kind: 'individual',
  },
  event: {
    name: 'Baby Shower de Martina',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [{ id: 'g-2', full_name: 'Laura Peña', rsvp: 'accepted' }],
  can_respond: true,
  gifts_open: true,
};

const mockGifts: GuestGift[] = [
  {
    id: 'gift-1',
    name: 'Coche para bebé',
    description: 'Color gris o neutro',
    category: 'Paseo',
    kind: 'unique',
    reserved_by_me: true,
    taken: true,
  },
];

describe('GuestGiftsPage', () => {
  let fixture: ComponentFixture<GuestGiftsPage>;
  let component: GuestGiftsPage;
  let mockGuestApi: {
    getInvitation: ReturnType<typeof vi.fn>;
    getGifts: ReturnType<typeof vi.fn>;
    reserveGift: ReturnType<typeof vi.fn>;
    releaseGift: ReturnType<typeof vi.fn>;
  };
  let alertController: AlertController;

  beforeEach(async () => {
    mockGuestApi = {
      getInvitation: vi.fn(),
      getGifts: vi.fn(),
      reserveGift: vi.fn(),
      releaseGift: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [GuestGiftsPage],
      providers: [
        provideRouter([]),
        { provide: GuestApiService, useValue: mockGuestApi },
      ],
    }).compileComponents();

    alertController = TestBed.inject(AlertController);
  });

  it('renders "Apartados por ustedes" for group invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Apartados por ustedes');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card__header .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Apartado por ustedes');
  });

  it('renders "Apartados por ti" for individual invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Apartados por ti');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card__header .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Apartado por ti');
  });

  it('prompts confirmation with "Alguien más podrá apartarlo" when releasing', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    const alertCreateSpy = vi.spyOn(alertController, 'create').mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLIonAlertElement);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    await component.onConfirmReleaseUnique(mockGifts[0]);

    expect(alertCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Liberar regalo',
        message: '¿Liberar Coche para bebé? Alguien más podrá apartarlo.',
      }),
    );
  });
});
