import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RsvpLogEntry } from '../../../core';
import { RsvpLogItemComponent } from './rsvp-log-item.component';

describe('RsvpLogItemComponent', () => {
  let fixture: ComponentFixture<RsvpLogItemComponent>;
  let component: RsvpLogItemComponent;
  const fixedNow = new Date('2026-11-07T15:00:00-05:00');

  const baseEntry: RsvpLogEntry = {
    id: 'log-1',
    invitation_id: 'inv-1',
    guest_id: 'guest-1',
    guest_name: 'María Pérez',
    group_name: 'Familia Pérez',
    invitation_kind: 'group',
    previous_rsvp: 'pending',
    rsvp: 'accepted',
    source: 'guest',
    actor_name: null,
    created_at: new Date('2026-11-07T14:50:00-05:00').toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RsvpLogItemComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RsvpLogItemComponent);
    component = fixture.componentInstance;
  });

  it('renders checkmark-circle icon with success color for accepted rsvp', () => {
    fixture.componentRef.setInput('entry', { ...baseEntry, rsvp: 'accepted' });
    fixture.componentRef.setInput('now', fixedNow);
    fixture.componentRef.setInput('link', ['/eventos', 'e1', 'invitaciones', 'inv-1']);
    fixture.detectChanges();

    const icon = fixture.debugElement.query(By.css('ion-icon'));
    const iconEl = icon.nativeElement as HTMLElement & { name?: string; color?: string };
    expect(iconEl.getAttribute('name') ?? iconEl.name).toBe('checkmark-circle');
    expect(iconEl.getAttribute('color') ?? iconEl.color).toBe('success');
    expect(icon.attributes['aria-hidden']).toBe('true');
    expect(icon.attributes['slot']).toBe('start');

    const h3 = fixture.debugElement.query(By.css('h3.text-name'));
    expect(h3.nativeElement.textContent).toContain('María Pérez');
    expect(h3.nativeElement.textContent).toContain('confirmó asistencia');
  });

  it('renders close-circle icon with danger color for declined rsvp', () => {
    fixture.componentRef.setInput('entry', { ...baseEntry, rsvp: 'declined' });
    fixture.componentRef.setInput('now', fixedNow);
    fixture.componentRef.setInput('link', ['/eventos', 'e1', 'invitaciones', 'inv-1']);
    fixture.detectChanges();

    const icon = fixture.debugElement.query(By.css('ion-icon'));
    const iconEl = icon.nativeElement as HTMLElement & { name?: string; color?: string };
    expect(iconEl.getAttribute('name') ?? iconEl.name).toBe('close-circle');
    expect(iconEl.getAttribute('color') ?? iconEl.color).toBe('danger');

    const h3 = fixture.debugElement.query(By.css('h3.text-name'));
    expect(h3.nativeElement.textContent).toContain('no asistirá');
  });

  it('renders time icon with warning color for pending rsvp', () => {
    fixture.componentRef.setInput('entry', { ...baseEntry, rsvp: 'pending' });
    fixture.componentRef.setInput('now', fixedNow);
    fixture.componentRef.setInput('link', ['/eventos', 'e1', 'invitaciones', 'inv-1']);
    fixture.detectChanges();

    const icon = fixture.debugElement.query(By.css('ion-icon'));
    const iconEl = icon.nativeElement as HTMLElement & { name?: string; color?: string };
    expect(iconEl.getAttribute('name') ?? iconEl.name).toBe('time');
    expect(iconEl.getAttribute('color') ?? iconEl.color).toBe('warning');

    const h3 = fixture.debugElement.query(By.css('h3.text-name'));
    expect(h3.nativeElement.textContent).toContain('quedó sin respuesta');
  });

  it('sets complete accessible aria-label on ion-item', () => {
    fixture.componentRef.setInput('entry', baseEntry);
    fixture.componentRef.setInput('now', fixedNow);
    fixture.componentRef.setInput('link', ['/eventos', 'e1', 'invitaciones', 'inv-1']);
    fixture.detectChanges();

    const item = fixture.debugElement.query(By.css('ion-item'));
    expect(item.attributes['aria-label']).toBe(
      'María Pérez confirmó asistencia. Familia Pérez · Desde la invitación · hace 10 min',
    );
  });

  it('omits group from detail and aria-label when invitation_kind is individual', () => {
    const individualEntry: RsvpLogEntry = {
      ...baseEntry,
      invitation_kind: 'individual',
      group_name: 'Familia Pérez',
      guest_name: 'María Pérez',
      source: 'guest',
    };

    fixture.componentRef.setInput('entry', individualEntry);
    fixture.componentRef.setInput('now', fixedNow);
    fixture.componentRef.setInput('link', ['/eventos', 'e1', 'invitaciones', 'inv-1']);
    fixture.detectChanges();

    const item = fixture.debugElement.query(By.css('ion-item'));
    expect(item.attributes['aria-label']).toBe(
      'María Pérez confirmó asistencia. Desde la invitación · hace 10 min',
    );

    const detailP = fixture.debugElement.query(By.css('p.text-label'));
    expect(detailP.nativeElement.textContent.trim()).toBe('Desde la invitación · hace 10 min');
  });
});
