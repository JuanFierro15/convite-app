import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CameraPermissionNoticeComponent } from './camera-permission-notice.component';

describe('CameraPermissionNoticeComponent', () => {
  let fixture: ComponentFixture<CameraPermissionNoticeComponent>;
  let component: CameraPermissionNoticeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CameraPermissionNoticeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CameraPermissionNoticeComponent);
    component = fixture.componentInstance;
  });

  it('muestra textos exactos y botón para permiso denied', async () => {
    fixture.componentRef.setInput('kind', 'denied');
    fixture.componentRef.setInput(
      'purpose',
      'Convite usa la cámara solo para tomar las fotos que subes a la galería del evento.',
    );
    fixture.componentRef.setInput('showGalleryOption', false);
    fixture.detectChanges();

    const titleEl = fixture.debugElement.query(By.css('.camera-notice__title'));
    expect(titleEl.nativeElement.textContent.trim()).toBe('Falta el permiso de la cámara');

    const textEl = fixture.debugElement.query(By.css('.camera-notice__text'));
    expect(textEl.nativeElement.textContent.trim()).toBe(
      'Convite usa la cámara solo para tomar las fotos que subes a la galería del evento.',
    );

    const buttons = fixture.debugElement.queryAll(By.css('ion-button'));
    expect(buttons.length).toBe(1);
    expect(buttons[0].nativeElement.textContent.trim()).toBe('Intentar de nuevo');

    const retrySpy = vi.fn();
    component.retry.subscribe(retrySpy);

    buttons[0].nativeElement.click();
    expect(retrySpy).toHaveBeenCalled();
  });

  it('muestra textos exactos, pasos y botón para permanently-denied', async () => {
    fixture.componentRef.setInput('kind', 'permanently-denied');
    fixture.componentRef.setInput('purpose', 'Cualquier proposito');
    fixture.componentRef.setInput('showGalleryOption', false);
    fixture.detectChanges();

    const titleEl = fixture.debugElement.query(By.css('.camera-notice__title'));
    expect(titleEl.nativeElement.textContent.trim()).toBe('La cámara está bloqueada');

    const textEl = fixture.debugElement.query(By.css('.camera-notice__text'));
    expect(textEl.nativeElement.textContent.trim()).toContain(
      'Android ya no vuelve a preguntar. Para usar la cámara, actívala en los ajustes:',
    );

    const steps = fixture.debugElement.queryAll(By.css('.camera-notice__steps li'));
    expect(steps.length).toBe(3);
    expect(steps[0].nativeElement.textContent.trim()).toBe('Abre los ajustes de Convite.');
    expect(steps[1].nativeElement.textContent.trim()).toBe('Entra a Permisos › Cámara.');
    expect(steps[2].nativeElement.textContent.trim()).toBe('Elige «Permitir solo mientras se usa la app».');

    const buttons = fixture.debugElement.queryAll(By.css('ion-button'));
    expect(buttons.length).toBe(1);
    expect(buttons[0].nativeElement.textContent.trim()).toBe('Abrir ajustes');

    const openSettingsSpy = vi.fn();
    component.openSettings.subscribe(openSettingsSpy);

    buttons[0].nativeElement.click();
    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('muestra botón secundario "Elegir de la galería" cuando showGalleryOption es true y emite chooseGallery', async () => {
    fixture.componentRef.setInput('kind', 'denied');
    fixture.componentRef.setInput('purpose', 'Proposito');
    fixture.componentRef.setInput('showGalleryOption', true);
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('ion-button'));
    expect(buttons.length).toBe(2);
    expect(buttons[1].nativeElement.textContent.trim()).toBe('Elegir de la galería');

    const gallerySpy = vi.fn();
    component.chooseGallery.subscribe(gallerySpy);

    buttons[1].nativeElement.click();
    expect(gallerySpy).toHaveBeenCalled();
  });
});
