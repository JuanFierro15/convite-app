// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  supabaseUrl: 'https://qyxcmmqzrdpwtcqdbnka.supabase.co',
  // La clave publishable es pública por diseño; la seguridad la imponen las políticas RLS.
  supabasePublishableKey: 'sb_publishable_0qgcAgslDIWDvQl6FMpobQ_JeK6YVI7',
  guestBaseUrl: 'http://localhost:8100',
};
