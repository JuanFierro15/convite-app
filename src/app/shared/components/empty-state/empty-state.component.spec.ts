import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();
  });

  it('renders the default empty-state illustration and message without button when actionLabel is omitted', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('message', 'No se encontraron invitaciones');
    fixture.detectChanges();

    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img.illustration');
    const message: HTMLElement | null = fixture.nativeElement.querySelector('.empty-state__message');
    const button: HTMLElement | null = fixture.nativeElement.querySelector('ion-button');

    expect(img?.getAttribute('src')).toBe('assets/themes/baby-shower/empty-state.webp');
    expect(message?.textContent?.trim()).toBe('No se encontraron invitaciones');
    expect(message?.classList.contains('text-body')).toBe(true);
    expect(button).toBeNull();
  });

  it('renders the action button when actionLabel is provided and emits action on click', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('message', 'Aún no hay regalos registrados');
    fixture.componentRef.setInput('actionLabel', 'Agregar regalo');
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.action.subscribe(() => {
      emitted = true;
    });

    const button: HTMLElement | null = fixture.nativeElement.querySelector('ion-button');
    expect(button).toBeTruthy();
    expect(button?.textContent?.trim()).toBe('Agregar regalo');

    button?.click();
    expect(emitted).toBe(true);
  });
});
