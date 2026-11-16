import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERIC_TITLE,
  GENERIC_DESCRIPTION,
  DEFAULT_THEME,
  KNOWN_THEMES,
  TITLE_MAX,
  DESCRIPTION_MAX,
  SECURITY_HEADERS,
  normalizeCode,
  truncate,
  genericPreview,
  buildPreview,
  fetchInvitationPreview,
} from '../../functions/_lib/preview.mjs';

const ORIGIN = 'https://convite-4v8.pages.dev';
const SUPABASE_URL = 'https://supabase.convite.test';
const PUBLISHABLE_KEY = 'sb_publishable_ejemplo_test';

function createFetchRecorder(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return { calls, fetchImpl };
}

test('normalizeCode: normaliza alfanumericos y aplica limites de 6 a 16 caracteres', () => {
  assert.equal(normalizeCode('abc-def-ghjk'), 'ABCDEFGHJK');
  assert.equal(normalizeCode('abcde'), null);
  assert.equal(normalizeCode('a1b2c3'), 'A1B2C3');
  assert.equal(normalizeCode('abcd1234efgh5678'), 'ABCD1234EFGH5678');
  assert.equal(normalizeCode('abcd1234efgh56789'), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode('<script>'), 'SCRIPT');
  assert.equal(normalizeCode('%%%'), null);
  assert.equal(normalizeCode(undefined), null);
  assert.equal(normalizeCode(123), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode('ÁBCDEFG😀'), 'BCDEFG');
});

test('truncate: conserva textos dentro del limite y recorta con puntos suspensivos sin espacios al final', () => {
  const exact80 = 'A'.repeat(TITLE_MAX);
  assert.equal(truncate(exact80, TITLE_MAX), exact80);
  assert.equal(truncate(exact80, TITLE_MAX).length, TITLE_MAX);

  const over81 = 'A'.repeat(TITLE_MAX + 1);
  const truncated81 = truncate(over81, TITLE_MAX);
  assert.equal(truncated81.length, TITLE_MAX);
  assert.equal(truncated81.endsWith('…'), true);
  assert.equal(truncated81, `${'A'.repeat(TITLE_MAX - 1)}…`);

  assert.equal(truncate('Convite', TITLE_MAX), 'Convite');
  assert.equal(truncate('Hola mundo', 6), 'Hola…');
});

test('genericPreview: arma la tarjeta generica con o sin codigo', () => {
  assert.deepEqual(genericPreview(ORIGIN, 'ABCDEFGHJK'), {
    title: GENERIC_TITLE,
    description: GENERIC_DESCRIPTION,
    image: `${ORIGIN}/assets/og/${DEFAULT_THEME}.v1.jpg`,
    url: `${ORIGIN}/i/ABCDEFGHJK`,
  });

  assert.deepEqual(genericPreview(ORIGIN, null), {
    title: GENERIC_TITLE,
    description: GENERIC_DESCRIPTION,
    image: `${ORIGIN}/assets/og/${DEFAULT_THEME}.v1.jpg`,
    url: `${ORIGIN}/`,
  });
});

test('buildPreview: nunca incluye datos de invitation ni guests en la salida', () => {
  const payload = {
    invitation: {
      id: 'inv-1',
      group_name: 'Familia Secreta',
      code: 'ABCDEFGHJK',
      kind: 'group',
    },
    event: {
      name: 'Baby Shower Ejemplo',
      theme_id: 'baby-shower',
      starts_at: '2026-11-29T20:00:00Z',
      venue_name: 'Salón Las Palmas',
      city: 'Neiva',
    },
    guests: [{ id: 'g-1', full_name: 'Persona Secreta', rsvp: 'pending' }],
  };

  const result = buildPreview(payload, ORIGIN, 'ABCDEFGHJK');
  assert.equal(JSON.stringify(result).includes('Secreta'), false);
  assert.equal(result.title, 'Baby Shower Ejemplo');
});

test('buildPreview: combina venue_name y city segun existan o falten', () => {
  const baseEvent = {
    name: 'Baby Shower Ejemplo',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T20:00:00Z',
  };

  const both = buildPreview(
    { event: { ...baseEvent, venue_name: 'Salón Las Palmas', city: 'Neiva' } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    both.description,
    'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.'
  );

  const onlyCity = buildPreview(
    { event: { ...baseEvent, venue_name: '   ', city: 'Neiva' } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    onlyCity.description,
    'Domingo 29 de noviembre, 3:00 p. m. · Neiva. Abre el enlace para ver tu invitación y confirmar.'
  );

  const onlyVenue = buildPreview(
    { event: { ...baseEvent, venue_name: 'Salón Las Palmas', city: null } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    onlyVenue.description,
    'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas. Abre el enlace para ver tu invitación y confirmar.'
  );

  const neither = buildPreview(
    { event: { ...baseEvent, venue_name: null, city: '' } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(neither.description.includes(' · '), false);
  assert.equal(neither.description.includes('..'), false);
  assert.equal(
    neither.description,
    'Domingo 29 de noviembre, 3:00 p. m. Abre el enlace para ver tu invitación y confirmar.'
  );
});

test('buildPreview: formatea fecha y hora en zona America/Bogota aunque cambie el dia respecto a UTC', () => {
  const nightUtc = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: '2026-11-30T03:00:00Z',
        venue_name: 'Salón Las Palmas',
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    nightUtc.description,
    'Domingo 29 de noviembre, 10:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.'
  );

  const afternoonUtc = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: '2026-11-29T20:00:00Z',
        venue_name: 'Salón Las Palmas',
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    afternoonUtc.description,
    'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.'
  );
});

test('buildPreview: maneja starts_at invalido con y sin lugar, y recorta descripciones largas', () => {
  const invalidNoPlace = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: 'fecha-invalida',
        venue_name: null,
        city: null,
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(invalidNoPlace.description, GENERIC_DESCRIPTION);

  const nullDateNoPlace = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: null,
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(nullDateNoPlace.description, GENERIC_DESCRIPTION);

  const invalidWithPlace = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: 'invalida',
        venue_name: 'Salón Las Palmas',
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(
    invalidWithPlace.description,
    'Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.'
  );

  const longVenue = 'Salón '.repeat(40);
  const longDesc = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: '2026-11-29T20:00:00Z',
        venue_name: longVenue,
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(longDesc.description.length <= DESCRIPTION_MAX, true);
  assert.equal(longDesc.description.endsWith('…'), true);
});

test('buildPreview: selecciona imagen segun temas conocidos o usa baby-shower por defecto', () => {
  assert.deepEqual(KNOWN_THEMES, ['baby-shower', 'honey-bee']);

  const honey = buildPreview(
    { event: { name: 'Evento Abejitas', theme_id: 'honey-bee' } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(honey.image, `${ORIGIN}/assets/og/honey-bee.v1.jpg`);

  const unknown = buildPreview(
    { event: { name: 'Evento Otro', theme_id: 'desconocido' } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(unknown.image, `${ORIGIN}/assets/og/baby-shower.v1.jpg`);

  const missing = buildPreview(
    { event: { name: 'Evento Sin Tema', theme_id: null } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(missing.image, `${ORIGIN}/assets/og/baby-shower.v1.jpg`);
});

test('buildPreview: respeta limites de titulo y no escapa caracteres HTML', () => {
  const exact80 = 'N'.repeat(TITLE_MAX);
  const exactResult = buildPreview(
    { event: { name: exact80 } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(exactResult.title, exact80);

  const over81 = 'N'.repeat(TITLE_MAX + 1);
  const overResult = buildPreview(
    { event: { name: over81 } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(overResult.title.length, TITLE_MAX);
  assert.equal(overResult.title.endsWith('…'), true);

  const specialChars = 'Baby Shower "Ejemplo" & <Familia>';
  const specialResult = buildPreview(
    { event: { name: specialChars } },
    ORIGIN,
    'ABCDEFGHJK'
  );
  assert.equal(specialResult.title, specialChars);
});

test('buildPreview: payload nulo, vacio o sin event.name devuelve genericPreview', () => {
  assert.deepEqual(buildPreview(null, ORIGIN, 'ABCDEFGHJK'), genericPreview(ORIGIN, 'ABCDEFGHJK'));
  assert.deepEqual(buildPreview({}, ORIGIN, 'ABCDEFGHJK'), genericPreview(ORIGIN, 'ABCDEFGHJK'));
  assert.deepEqual(
    buildPreview({ event: { name: '' } }, ORIGIN, 'ABCDEFGHJK'),
    genericPreview(ORIGIN, 'ABCDEFGHJK')
  );
  assert.deepEqual(
    buildPreview({ event: { name: '   ' } }, ORIGIN, 'ABCDEFGHJK'),
    genericPreview(ORIGIN, 'ABCDEFGHJK')
  );
});

test('fetchInvitationPreview: consulta la RPC con codigo normalizado y arma la tarjeta con respuesta valida', async () => {
  const recorder = createFetchRecorder(
    async () =>
      new Response(
        JSON.stringify({
          invitation: { group_name: 'Familia Secreta' },
          event: {
            name: 'Baby Shower Ejemplo',
            theme_id: 'honey-bee',
            starts_at: '2026-11-29T20:00:00Z',
            venue_name: 'Salón Las Palmas',
            city: 'Neiva',
          },
          guests: [{ full_name: 'Persona Secreta' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  );

  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 1);
  const call = recorder.calls[0];
  assert.equal(call.url, `${SUPABASE_URL}/rest/v1/rpc/get_invitation`);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.apikey, PUBLISHABLE_KEY);
  assert.equal(call.options.headers.Authorization, `Bearer ${PUBLISHABLE_KEY}`);
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.equal(call.options.body, '{"p_code":"ABCDEFGHJK"}');
  assert.equal(call.options.signal instanceof AbortSignal, true);

  assert.deepEqual(result, {
    title: 'Baby Shower Ejemplo',
    description:
      'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.',
    image: `${ORIGIN}/assets/og/honey-bee.v1.jpg`,
    url: `${ORIGIN}/i/ABCDEFGHJK`,
  });
});

test('fetchInvitationPreview: JSON null devuelve tarjeta generica con url del codigo normalizado', async () => {
  const recorder = createFetchRecorder(
    async () =>
      new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );

  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 1);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
});

test('fetchInvitationPreview: estado HTTP 500 devuelve tarjeta generica', async () => {
  const recorder = createFetchRecorder(
    async () => new Response('Internal Server Error', { status: 500 })
  );

  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 1);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
});

test('fetchInvitationPreview: json() que lanza error devuelve tarjeta generica', async () => {
  const recorder = createFetchRecorder(async () => ({
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError('JSON invalido');
    },
  }));

  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 1);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
});

test('fetchInvitationPreview: error de red en fetchImpl devuelve tarjeta generica', async () => {
  const recorder = createFetchRecorder(async () => {
    throw new TypeError('Error de red simulado');
  });

  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 1);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
});

test('fetchInvitationPreview: corta por tiempo limite aunque fetchImpl ignore signal y no resuelva', async () => {
  const recorder = createFetchRecorder(() => new Promise(() => {}));

  const startedAt = Date.now();
  const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 50,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(recorder.calls.length, 1);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
  assert.equal(elapsedMs < 1000, true);
});

test('fetchInvitationPreview: codigo invalido devuelve tarjeta generica sin llamar a fetchImpl', async () => {
  const recorder = createFetchRecorder(async () => {
    throw new Error('No debio llamarse fetchImpl');
  });

  const result = await fetchInvitationPreview('abc', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });

  assert.equal(recorder.calls.length, 0);
  assert.deepEqual(result, genericPreview(ORIGIN, null));
});

test('SECURITY_HEADERS: expone los cuatro encabezados de seguridad esperados', () => {
  assert.deepEqual(SECURITY_HEADERS, {
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Robots-Tag': 'noindex, nofollow',
  });
});
