import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../core/theme/theme.service';
import { IllustrationComponent } from './illustration.component';

describe('IllustrationComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IllustrationComponent],
    }).compileComponents();
  });

  it('renders an image with the illustration class, lazy loading, alt and resolved asset path', () => {
    const fixture = TestBed.createComponent(IllustrationComponent);
    fixture.componentRef.setInput('name', 'countdown');
    fixture.componentRef.setInput('alt', 'Cuenta regresiva del evento');
    fixture.detectChanges();

    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img.illustration');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('assets/themes/baby-shower/countdown.webp');
    expect(img?.getAttribute('alt')).toBe('Cuenta regresiva del evento');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('uses ThemeService.current() when themeId is not provided', () => {
    const themeService = TestBed.inject(ThemeService);
    themeService.apply('bautizo');

    const fixture = TestBed.createComponent(IllustrationComponent);
    fixture.componentRef.setInput('name', 'rsvp-sent');
    fixture.componentRef.setInput('alt', 'Respuesta enviada');
    fixture.detectChanges();

    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img.illustration');
    expect(img?.getAttribute('src')).toBe('assets/themes/baby-shower/rsvp-sent.webp');
  });
});
