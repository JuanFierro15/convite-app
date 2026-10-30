import {
  APP_ICON_THEME,
  DEFAULT_THEME,
  INTRO_VIDEO_VERSION,
  THEMES,
  introVideoSources,
  isThemeId,
  themeOptionsFor,
} from './themes';

describe('themes registry', () => {
  it('contains themes in order with expected labels and no duplicate ids', () => {
    const ids = THEMES.map((theme) => theme.id);
    const labels = THEMES.map((theme) => theme.label);

    expect(ids).toEqual(['baby-shower', 'honey-bee', 'bautizo']);
    expect(labels).toEqual([
      'Jardín de algodón',
      'Miel y flores silvestres',
      'Bautizo',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('restricts selectable themes to baby-shower and honey-bee with bautizo having no own assets', () => {
    const selectableIds = THEMES.filter((theme) => theme.selectable).map(
      (theme) => theme.id,
    );
    expect(selectableIds).toEqual(['baby-shower', 'honey-bee']);

    const bautizo = THEMES.find((theme) => theme.id === 'bautizo');
    expect(bautizo?.selectable).toBe(false);
    expect(bautizo?.hasOwnAssets).toBe(false);

    const withoutAssets = THEMES.filter((theme) => !theme.hasOwnAssets).map(
      (theme) => theme.id,
    );
    expect(withoutAssets).toEqual(['bautizo']);
  });

  it('returns selectable themes for undefined, null, non-existent, or selectable ids, and appends bautizo when current', () => {
    const testCases: (string | null | undefined)[] = [
      undefined,
      null,
      'inexistente',
      'baby-shower',
      'honey-bee',
    ];

    for (const currentId of testCases) {
      const options = themeOptionsFor(currentId).map((theme) => theme.id);
      expect(options).toEqual(['baby-shower', 'honey-bee']);
    }

    const bautizoOptions = themeOptionsFor('bautizo').map((theme) => theme.id);
    expect(bautizoOptions).toEqual(['baby-shower', 'honey-bee', 'bautizo']);
  });

  it('returns a new array each time so mutating the result does not affect subsequent calls or THEMES', () => {
    const initialThemesLength = THEMES.length;
    const firstCall = themeOptionsFor();

    firstCall.push({
      id: 'bautizo',
      label: 'Bautizo',
      selectable: false,
      hasOwnAssets: false,
      introVideo: false,
    });

    const secondCall = themeOptionsFor();
    expect(secondCall.map((theme) => theme.id)).toEqual([
      'baby-shower',
      'honey-bee',
    ]);
    expect(THEMES.length).toBe(initialThemesLength);
  });

  it('validates theme ids correctly with isThemeId', () => {
    expect(isThemeId('baby-shower')).toBe(true);
    expect(isThemeId('honey-bee')).toBe(true);
    expect(isThemeId('bautizo')).toBe(true);

    expect(isThemeId('inexistente')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it('defines DEFAULT_THEME as baby-shower and APP_ICON_THEME as honey-bee', () => {
    expect(DEFAULT_THEME).toBe('baby-shower');
    expect(APP_ICON_THEME).toBe('honey-bee');
  });

  it('configures introVideo as true only for honey-bee', () => {
    const honeyBee = THEMES.find((theme) => theme.id === 'honey-bee');
    expect(honeyBee?.introVideo).toBe(true);

    const nonVideoThemes = THEMES.filter((theme) => theme.id !== 'honey-bee');
    for (const theme of nonVideoThemes) {
      expect(theme.introVideo).toBe(false);
    }
  });

  it('builds intro video sources for vertical and horizontal orientations with version prefix', () => {
    expect(introVideoSources('honey-bee', 'vertical')).toEqual({
      video: `assets/video/honey-bee/intro-vertical.${INTRO_VIDEO_VERSION}.mp4`,
      poster: `assets/video/honey-bee/intro-vertical.${INTRO_VIDEO_VERSION}.webp`,
    });

    expect(introVideoSources('honey-bee', 'horizontal')).toEqual({
      video: `assets/video/honey-bee/intro-horizontal.${INTRO_VIDEO_VERSION}.mp4`,
      poster: `assets/video/honey-bee/intro-horizontal.${INTRO_VIDEO_VERSION}.webp`,
    });
  });

  it('returns null intro video sources for themes without video or unknown themes', () => {
    expect(introVideoSources('baby-shower', 'vertical')).toBeNull();
    expect(introVideoSources('bautizo', 'vertical')).toBeNull();
    expect(introVideoSources(null, 'vertical')).toBeNull();
    expect(introVideoSources(undefined, 'vertical')).toBeNull();
    expect(introVideoSources('desconocido', 'vertical')).toBeNull();
  });
});
