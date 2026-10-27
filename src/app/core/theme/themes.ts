export type ThemeId = 'baby-shower' | 'honey-bee' | 'bautizo';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  selectable: boolean;
  hasOwnAssets: boolean;
}

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'baby-shower', label: 'Jardín de algodón', selectable: true, hasOwnAssets: true },
  { id: 'honey-bee', label: 'Miel y flores silvestres', selectable: true, hasOwnAssets: true },
  // Sin imágenes propias no se ofrece al crear, pero sigue válido para los eventos que ya lo tienen.
  { id: 'bautizo', label: 'Bautizo', selectable: false, hasOwnAssets: false },
];

export const DEFAULT_THEME: ThemeId = 'baby-shower';

// El ícono de la app y el logo del inicio de sesión son los mismos para todos los eventos.
export const APP_ICON_THEME: ThemeId = 'honey-bee';

export type ThemeAsset =
  | 'hero-cover.webp'
  | 'countdown.webp'
  | 'empty-state.webp'
  | 'rsvp-sent.webp'
  | 'gift-reserved.webp'
  | 'app-icon.png';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function findTheme(id: string | null | undefined): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function themeOptionsFor(currentId?: string | null): ThemeDefinition[] {
  const options = THEMES.filter((theme) => theme.selectable);
  const current = findTheme(currentId);
  if (current && !current.selectable) {
    options.push(current);
  }
  return options;
}
