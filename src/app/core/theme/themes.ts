export type ThemeId = 'baby-shower' | 'honey-bee';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  introVideo: boolean;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'baby-shower',
    label: 'Jardín de algodón',
    introVideo: false,
  },
  {
    id: 'honey-bee',
    label: 'Miel y flores silvestres',
    introVideo: true,
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

export function themeOptionsFor(): ThemeDefinition[] {
  return [...THEMES];
}

// El sufijo de versión va en el nombre del archivo porque se publica con caché de un año.
export const INTRO_VIDEO_VERSION = 'v3';

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

