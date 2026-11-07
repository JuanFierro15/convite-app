import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;
  let component: PaginationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
  });

  it('no dibuja nada si totalPages <= 1', () => {
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 1);
    fixture.componentRef.setInput('label', 'Paginación de prueba');
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav.pagination'));
    expect(nav).toBeNull();
  });

  it('muestra "Página 2 de 3" cuando page=2 y totalPages=3', () => {
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('label', 'Paginación de prueba');
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav.pagination'));
    expect(nav).not.toBeNull();
    expect(nav.attributes['aria-label']).toBe('Paginación de prueba');

    const status = fixture.debugElement.query(By.css('.pagination__status'));
    expect(status.nativeElement.textContent.trim()).toBe('Página 2 de 3');
  });

  it('deshabilita el botón "Anterior" en la página 1 y habilita "Siguiente"', () => {
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('label', 'Paginación de prueba');
    fixture.detectChanges();

    const prevBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página anterior"]'));
    const nextBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página siguiente"]'));

    expect(prevBtn.nativeElement.disabled ?? prevBtn.nativeElement.hasAttribute('disabled')).toBe(true);
    expect(nextBtn.nativeElement.disabled ?? nextBtn.nativeElement.hasAttribute('disabled')).toBe(false);
  });

  it('deshabilita el botón "Siguiente" en la última página y habilita "Anterior"', () => {
    fixture.componentRef.setInput('page', 3);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('label', 'Paginación de prueba');
    fixture.detectChanges();

    const prevBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página anterior"]'));
    const nextBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página siguiente"]'));

    expect(prevBtn.nativeElement.disabled ?? prevBtn.nativeElement.hasAttribute('disabled')).toBe(false);
    expect(nextBtn.nativeElement.disabled ?? nextBtn.nativeElement.hasAttribute('disabled')).toBe(true);
  });

  it('emite previous y next al hacer click en los botones respectivos', () => {
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('label', 'Paginación de prueba');
    fixture.detectChanges();

    const prevSpy = vi.fn();
    const nextSpy = vi.fn();
    component.previous.subscribe(prevSpy);
    component.next.subscribe(nextSpy);

    const prevBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página anterior"]'));
    const nextBtn = fixture.debugElement.query(By.css('ion-button[aria-label="Página siguiente"]'));

    prevBtn.nativeElement.click();
    expect(prevSpy).toHaveBeenCalledTimes(1);

    nextBtn.nativeElement.click();
    expect(nextSpy).toHaveBeenCalledTimes(1);
  });
});
