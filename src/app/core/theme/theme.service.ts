import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { DEFAULT_THEME, THEMES, ThemeAsset, ThemeId } from './themes';

export { DEFAULT_THEME, THEMES, type ThemeAsset, type ThemeId } from './themes';

const THEMES_WITH_OWN_ASSETS: ReadonlySet<ThemeId> = new Set<ThemeId>(['baby-shower']);

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
    const resolved = this.resolveThemeId(themeId);
    const assetTheme = THEMES_WITH_OWN_ASSETS.has(resolved) ? resolved : DEFAULT_THEME;
    return `assets/themes/${assetTheme}/${file}`;
  }

  private resolveThemeId(themeId: string | null | undefined): ThemeId {
    if (themeId && THEMES.some((theme) => theme.id === themeId)) {
      return themeId as ThemeId;
    }
    return DEFAULT_THEME;
  }
}
