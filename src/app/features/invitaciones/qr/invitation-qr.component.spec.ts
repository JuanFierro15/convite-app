import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { InvitationsRepository } from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';
import { InvitationQrComponent } from './invitation-qr.component';

describe('InvitationQrComponent', () => {
  let fixture: ComponentFixture<InvitationQrComponent>;
  let component: InvitationQrComponent;
  let mockInvitationsRepo: { guestLink: ReturnType<typeof vi.fn> };
  let mockModalCtrl: { dismiss: ReturnType<typeof vi.fn> };
  let mockActionsService: { showError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockInvitationsRepo = {
      guestLink: vi.fn().mockReturnValue('https://convite.test/i/ABC1234'),
    };
    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };
    mockActionsService = {
      showError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InvitationQrComponent],
      providers: [
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: InvitationActionsService, useValue: mockActionsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationQrComponent);
    component = fixture.componentInstance;
    component.invitation = {
      group_name: 'Familia Ejemplo',
      code: 'ABC1234',
    };
    component.eventName = 'Evento Ejemplo';
  });

  it('initializes invitation link and labels', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.groupName()).toBe('Familia Ejemplo');
    expect(mockInvitationsRepo.guestLink).toHaveBeenCalledWith('ABC1234');
    expect(component.guestUrl()).toBe('https://convite.test/i/ABC1234');
  });

  it('dismisses modal when close is called', async () => {
    await component.close();
    expect(mockModalCtrl.dismiss).toHaveBeenCalled();
  });
});
