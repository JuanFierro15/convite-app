import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import {
  GuestApiError,
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
    remaining: null,
    full: false,
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
  let mockToastController: {
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockGuestApi = {
      getInvitation: vi.fn(),
      getGifts: vi.fn(),
      reserveGift: vi.fn(),
      releaseGift: vi.fn(),
    };
    mockToastController = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [GuestGiftsPage],
      providers: [
        provideRouter([]),
        { provide: GuestApiService, useValue: mockGuestApi },
        { provide: ToastController, useValue: mockToastController },
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

  it('un repetible con remaining: 4, full: false muestra "Quedan 4 cupos"; con remaining: 1, "Queda 1 cupo"', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([
      {
        id: 'gift-rep-4',
        name: 'Pañales etapa 1',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 4,
        full: false,
      },
    ]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const remainingEl4 = fixture.nativeElement.querySelector('.gift-card__remaining');
    expect(remainingEl4?.textContent?.trim()).toBe('Quedan 4 cupos');

    component.gifts.set([
      {
        id: 'gift-rep-1',
        name: 'Pañales etapa 1',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 1,
        full: false,
      },
    ]);
    fixture.detectChanges();

    const remainingEl1 = fixture.nativeElement.querySelector('.gift-card__remaining');
    expect(remainingEl1?.textContent?.trim()).toBe('Queda 1 cupo');
  });

  it('un repetible con full: true y reserved_by_me: false muestra "Completo" y su botón está deshabilitado; onToggleUnlimitedGift no llama a reserveGift', async () => {
    const fullGift: GuestGift = {
      id: 'gift-full',
      name: 'Pañales etapa 2',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 0,
      full: true,
    };

    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([fullGift]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const badgeEl = fixture.nativeElement.querySelector('.taken-badge');
    expect(badgeEl?.textContent?.trim()).toBe('Completo');

    const buttonEl = fixture.nativeElement.querySelector('.gift-card ion-button');
    expect(buttonEl?.disabled).toBe(true);

    await component.onToggleUnlimitedGift(fullGift);
    expect(mockGuestApi.reserveGift).not.toHaveBeenCalled();
  });

  it('un repetible con full: true y reserved_by_me: true muestra "Quitar mi elección" habilitado y al usarlo llama a releaseGift', async () => {
    const myFullGift: GuestGift = {
      id: 'gift-my-full',
      name: 'Pañales etapa 3',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: true,
      taken: false,
      remaining: 0,
      full: true,
    };

    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([myFullGift]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const buttonEl = fixture.nativeElement.querySelector('.gift-card ion-button');
    expect(buttonEl?.textContent?.trim()).toContain('Quitar mi elección');
    expect(buttonEl?.disabled).toBe(false);

    await component.onToggleUnlimitedGift(myFullGift);
    expect(mockGuestApi.releaseGift).toHaveBeenCalledWith('ABCD1234JK', 'gift-my-full');
  });

  it('si reserveGift falla con gift_full, se muestra el mensaje y se recarga la lista', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([
      {
        id: 'gift-rep',
        name: 'Pañales etapa 1',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 1,
        full: false,
      },
    ]);

    mockGuestApi.reserveGift.mockRejectedValue(new GuestApiError('gift_full'));

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    mockGuestApi.getGifts.mockClear();

    await component.executeReserve('gift-rep');

    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Esta opción ya completó sus cupos. Elige otra de la lista.',
        color: 'danger',
      }),
    );
    expect(mockGuestApi.getGifts).toHaveBeenCalledWith('ABCD1234JK');
  });
});
