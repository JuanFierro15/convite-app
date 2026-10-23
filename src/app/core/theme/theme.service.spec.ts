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

  it('applies a valid theme to documentElement and updates current', () => {
    service.apply('bautizo');

    expect(doc.documentElement.getAttribute('data-theme')).toBe('bautizo');
    expect(service.current()).toBe('bautizo');
  });

  it('falls back to DEFAULT_THEME when applying an invalid or empty themeId', () => {
    service.apply('bautizo');
    service.apply('inexistente');

    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');
    expect(service.current()).toBe('baby-shower');

    service.apply(null);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');

    service.apply(undefined);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('baby-shower');
  });

  it('returns the asset path for themes with own assets and falls back to baby-shower otherwise', () => {
    expect(service.asset('baby-shower', 'hero-cover.webp')).toBe(
      'assets/themes/baby-shower/hero-cover.webp',
    );
    expect(service.asset('bautizo', 'countdown.webp')).toBe(
      'assets/themes/baby-shower/countdown.webp',
    );
    expect(service.asset(null, 'empty-state.webp')).toBe(
      'assets/themes/baby-shower/empty-state.webp',
    );
  });
});
