import { TestBed } from '@angular/core/testing';
import { BadgeStatus, StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();
  });

  it('renders the default Spanish text and soft badge class for each status', () => {
    const expected: Record<BadgeStatus, { text: string; cssClass: string }> = {
      accepted: { text: 'Confirmada', cssClass: 'badge-soft-success' },
      pending: { text: 'Pendiente', cssClass: 'badge-soft-warning' },
      declined: { text: 'Cancelada', cssClass: 'badge-soft-danger' },
      partial: { text: 'Parcial', cssClass: 'badge-soft-tertiary' },
    };

    const fixture = TestBed.createComponent(StatusBadgeComponent);

    for (const [status, info] of Object.entries(expected) as [
      BadgeStatus,
      { text: string; cssClass: string },
    ][]) {
      fixture.componentRef.setInput('status', status);
      fixture.detectChanges();

      const span: HTMLElement | null = fixture.nativeElement.querySelector('span');
      expect(span?.textContent?.trim()).toBe(info.text);
      expect(span?.classList.contains(info.cssClass)).toBe(true);
    }
  });

  it('overrides the default text when label is provided', () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'accepted');
    fixture.componentRef.setInput('label', 'Apartado por: Familia Ejemplo');
    fixture.detectChanges();

    const span: HTMLElement | null = fixture.nativeElement.querySelector('span');
    expect(span?.textContent?.trim()).toBe('Apartado por: Familia Ejemplo');
    expect(span?.classList.contains('badge-soft-success')).toBe(true);
  });

  it('falls back to pending behavior on unknown status', () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'unknown_status' as BadgeStatus);
    fixture.detectChanges();

    const span: HTMLElement | null = fixture.nativeElement.querySelector('span');
    expect(span?.textContent?.trim()).toBe('Pendiente');
    expect(span?.classList.contains('badge-soft-warning')).toBe(true);

    fixture.componentRef.setInput('label', 'Etiqueta Personalizada');
    fixture.detectChanges();
    expect(span?.textContent?.trim()).toBe('Etiqueta Personalizada');
    expect(span?.classList.contains('badge-soft-warning')).toBe(true);
  });
});
