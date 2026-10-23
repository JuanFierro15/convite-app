export type ThemeId = 'baby-shower' | 'bautizo';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'baby-shower', label: 'Baby shower' },
  { id: 'bautizo', label: 'Bautizo' },
];

export const DEFAULT_THEME: ThemeId = 'baby-shower';

export type ThemeAsset =
  | 'hero-cover.webp'
  | 'countdown.webp'
  | 'empty-state.webp'
  | 'rsvp-sent.webp'
  | 'gift-reserved.webp'
  | 'app-icon.png';
