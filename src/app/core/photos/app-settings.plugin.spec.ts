import { AppSettings } from './app-settings.plugin';

describe('AppSettingsPlugin', () => {
  it('responde { opened: false } en la plataforma web (jsdom)', async () => {
    const result = await AppSettings.open();
    expect(result).toEqual({ opened: false });
  });
});
