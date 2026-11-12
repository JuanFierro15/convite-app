import { registerPlugin } from '@capacitor/core';

export interface AppSettingsPlugin {
  open(): Promise<{ opened: boolean }>;
}

export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings', {
  web: () => ({ open: async () => ({ opened: false }) }),
});
