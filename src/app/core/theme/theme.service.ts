import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { DEFAULT_THEME, ThemeAsset, ThemeId, isThemeId } from './themes';

export { DEFAULT_THEME, THEMES, type ThemeAsset, type ThemeId } from './themes';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly currentSignal = signal<ThemeId>(DEFAULT_THEME);

  readonly current = this.currentSignal.asReadonly();

  apply(themeId: string | null | undefined): ThemeId {
    const resolved = this.resolveThemeId(themeId);
    this.document.documentElement.setAttribute('data-theme', resolved);
    this.currentSignal.set(resolved);
    return resolved;
  }

  asset(themeId: string | null | undefined, file: ThemeAsset): string {
    return `assets/themes/${this.resolveThemeId(themeId)}/${file}`;
  }

  private resolveThemeId(themeId: string | null | undefined): ThemeId {
    return isThemeId(themeId) ? themeId : DEFAULT_THEME;
  }
}
