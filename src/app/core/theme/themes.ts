export type ThemeId = 'baby-shower' | 'honey-bee' | 'bautizo';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  selectable: boolean;
  hasOwnAssets: boolean;
  introVideo: boolean;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'baby-shower',
    label: 'Jardín de algodón',
    selectable: true,
    hasOwnAssets: true,
    introVideo: false,
  },
  {
    id: 'honey-bee',
    label: 'Miel y flores silvestres',
    selectable: true,
    hasOwnAssets: true,
    introVideo: true,
  },
  // Sin imágenes propias no se ofrece al crear, pero sigue válido para los eventos que ya lo tienen.
  {
    id: 'bautizo',
    label: 'Bautizo',
    selectable: false,
    hasOwnAssets: false,
    introVideo: false,
  },
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

// El sufijo de versión va en el nombre del archivo porque se publica con caché de un año.
export const INTRO_VIDEO_VERSION = 'v2';

export type IntroOrientation = 'vertical' | 'horizontal';

export interface IntroVideoSources {
  video: string;
  poster: string;
}

export function introVideoSources(
  themeId: string | null | undefined,
  orientation: IntroOrientation,
): IntroVideoSources | null {
  const theme = findTheme(themeId);
  if (!theme || !theme.introVideo) {
    return null;
  }
  const prefix = `assets/video/${theme.id}/intro-${orientation}.${INTRO_VIDEO_VERSION}`;
  return {
    video: `${prefix}.mp4`,
    poster: `${prefix}.webp`,
  };
}

