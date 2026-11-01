import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_THEME, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let doc: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
    doc = TestBed.inject(DOCUMENT);
    doc.documentElement.removeAttribute('data-theme');
  });

  it('starts with DEFAULT_THEME in current signal', () => {
    expect(service.current()).toBe(DEFAULT_THEME);
  });

  it('applies honey-bee theme to documentElement and updates current', () => {
    service.apply('honey-bee');

    expect(doc.documentElement.getAttribute('data-theme')).toBe('honey-bee');
    expect(service.current()).toBe('honey-bee');
  });

  it('falls back to DEFAULT_THEME when applying an invalid or empty themeId', () => {
    service.apply('honey-bee');
    service.apply('tema-inexistente');

    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');
    expect(service.current()).toBe('baby-shower');

    service.apply(null);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');

    service.apply(undefined);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');
  });

  it('returns the asset path for valid themes and falls back to baby-shower for an invented or missing id', () => {
    expect(service.asset('baby-shower', 'hero-cover.webp')).toBe(
      'assets/themes/baby-shower/hero-cover.webp',
    );
    expect(service.asset('honey-bee', 'countdown.webp')).toBe(
      'assets/themes/honey-bee/countdown.webp',
    );
    expect(service.asset('tema-inexistente', 'countdown.webp')).toBe(
      'assets/themes/baby-shower/countdown.webp',
    );
    expect(service.asset(null, 'empty-state.webp')).toBe(
      'assets/themes/baby-shower/empty-state.webp',
    );
    expect(service.asset(undefined, 'empty-state.webp')).toBe(
      'assets/themes/baby-shower/empty-state.webp',
    );
  });

  it('returns own asset paths for honey-bee theme assets', () => {
    expect(service.asset('honey-bee', 'countdown.webp')).toBe(
      'assets/themes/honey-bee/countdown.webp',
    );
    expect(service.asset('honey-bee', 'app-icon.png')).toBe(
      'assets/themes/honey-bee/app-icon.png',
    );
  });
});
