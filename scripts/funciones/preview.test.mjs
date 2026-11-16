import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

function parseRootHeadersFile() {
  const raw = fs.readFileSync(path.resolve('src/web/_headers'), 'utf8');
  const lines = raw.split(/\r?\n/);
  const headers = {};
  let inRootBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inRootBlock) {
      if (trimmed === '/*') {
        inRootBlock = true;
      }
      continue;
    }

    if (trimmed === '' || !/^\s/.test(line)) {
      break;
    }
    if (trimmed.startsWith('!') || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const name = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      headers[name] = value;
    }
  }

  return headers;
}

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

  assert.equal(truncate('Convite', 1), '…');
  assert.equal(truncate('A', 1), 'A');
  assert.equal(truncate('😀A', 1), '…');
  assert.equal(truncate('Convite', 0), '');
  assert.equal(truncate('Convite', -1), '');

  const validSurrogatePattern = /^([^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/;
  const emojiAt79 = `${'A'.repeat(79)}😀B`;
  assert.equal(Array.from(emojiAt79).length, 81);
  const truncatedEmojiAt79 = truncate(emojiAt79, TITLE_MAX);
  assert.equal(Array.from(truncatedEmojiAt79).length, TITLE_MAX);
  assert.equal(truncatedEmojiAt79.endsWith('…'), true);
  assert.equal(validSurrogatePattern.test(truncatedEmojiAt79), true);
  assert.equal(truncatedEmojiAt79, `${'A'.repeat(79)}…`);

  const emojiAt78 = `${'A'.repeat(78)}😀BC`;
  assert.equal(Array.from(emojiAt78).length, 81);
  const truncatedEmojiAt78 = truncate(emojiAt78, TITLE_MAX);
  assert.equal(Array.from(truncatedEmojiAt78).length, TITLE_MAX);
  assert.equal(validSurrogatePattern.test(truncatedEmojiAt78), true);
  assert.equal(truncatedEmojiAt78, `${'A'.repeat(78)}😀…`);
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

test('buildPreview: nunca incluye datos privados ni de invitation o guests en la salida', () => {
  const payload = {
    invitation: {
      id: 'inv-privada-001',
      group_name: 'Familia Secreta Privada',
      code: 'ABCDEFGHJK',
      kind: 'group',
    },
    event: {
      name: 'Baby Shower Ejemplo',
      theme_id: 'baby-shower',
      starts_at: '2026-11-29T20:00:00Z',
      venue_name: 'Salón Las Palmas',
      venue_address: 'Calle Ficticia 123 Secreta',
      city: 'Neiva',
      map_url: 'https://mapa.convite.test/ubicacion-secreta',
      welcome_message: 'Mensaje privado de bienvenida secreto',
      rsvp_deadline: '2026-11-20T23:59:59Z',
    },
    guests: [{ id: 'g-1', full_name: 'Persona Secreta Privada', rsvp: 'pending' }],
    can_respond: true,
    gifts_open: true,
  };

  const result = buildPreview(payload, ORIGIN, 'ABCDEFGHJK');
  assert.deepEqual(result, {
    title: 'Baby Shower Ejemplo',
    description:
      'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.',
    image: `${ORIGIN}/assets/og/baby-shower.v1.jpg`,
    url: `${ORIGIN}/i/ABCDEFGHJK`,
  });

  const serialized = JSON.stringify(result);
  for (const sensitive of [
    payload.invitation.group_name,
    payload.guests[0].full_name,
    payload.event.venue_address,
    payload.event.map_url,
    payload.event.welcome_message,
  ]) {
    assert.equal(serialized.includes(sensitive), false);
  }
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

  const venue103 = 'V'.repeat(103);
  const exact200 = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: '2026-11-29T20:00:00Z',
        venue_name: venue103,
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  const expected200 = `Domingo 29 de noviembre, 3:00 p. m. · ${venue103}, Neiva. Abre el enlace para ver tu invitación y confirmar.`;
  assert.equal(expected200.length, DESCRIPTION_MAX);
  assert.equal(exact200.description, expected200);

  const venue104 = 'V'.repeat(104);
  const over201 = buildPreview(
    {
      event: {
        name: 'Baby Shower Ejemplo',
        theme_id: 'baby-shower',
        starts_at: '2026-11-29T20:00:00Z',
        venue_name: venue104,
        city: 'Neiva',
      },
    },
    ORIGIN,
    'ABCDEFGHJK'
  );
  const expectedTruncated200 = `Domingo 29 de noviembre, 3:00 p. m. · ${venue104}, Neiva. Abre el enlace para ver tu invitación y confirma…`;
  assert.equal(over201.description.length, DESCRIPTION_MAX);
  assert.equal(over201.description.endsWith('…'), true);
  assert.equal(over201.description, expectedTruncated200);
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

test('KNOWN_THEMES: cada tema tiene su archivo og/<tema>.v1.jpg en src/web', () => {
  for (const theme of KNOWN_THEMES) {
    const imagePath = path.resolve('src/web/og', `${theme}.v1.jpg`);
    assert.equal(fs.existsSync(imagePath), true, `Falta la imagen OG del tema ${theme}`);
  }
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
  assert.equal(recorder.calls[0].options.signal.aborted, true);
  assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
  assert.equal(elapsedMs < 500, true);
});

test('fetchInvitationPreview: rechazo de fetchImpl despues de vencer el tiempo no deja unhandledRejection', async () => {
  let unhandledCount = 0;
  const onUnhandled = () => {
    unhandledCount += 1;
  };
  process.on('unhandledRejection', onUnhandled);

  let rejectFetch;
  const recorder = createFetchRecorder(
    () =>
      new Promise((_, reject) => {
        rejectFetch = reject;
      })
  );

  try {
    const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
      fetchImpl: recorder.fetchImpl,
      timeoutMs: 20,
      supabaseUrl: SUPABASE_URL,
      publishableKey: PUBLISHABLE_KEY,
    });

    assert.deepEqual(result, genericPreview(ORIGIN, 'ABCDEFGHJK'));
    assert.equal(recorder.calls[0].options.signal.aborted, true);

    rejectFetch(new Error('Fallo tardio despues del timeout'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(unhandledCount, 0);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('fetchInvitationPreview: timeoutMs invalido usa valor por defecto y devuelve tarjeta del evento', async () => {
  for (const invalidTimeout of [-1, Number.NaN, 'x']) {
    const recorder = createFetchRecorder(
      async () =>
        new Response(
          JSON.stringify({
            event: {
              name: 'Baby Shower Ejemplo',
              theme_id: 'baby-shower',
              starts_at: '2026-11-29T20:00:00Z',
              venue_name: 'Salón Las Palmas',
              city: 'Neiva',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    const result = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
      fetchImpl: recorder.fetchImpl,
      timeoutMs: invalidTimeout,
      supabaseUrl: SUPABASE_URL,
      publishableKey: PUBLISHABLE_KEY,
    });

    assert.equal(recorder.calls.length, 1);
    assert.equal(result.title, 'Baby Shower Ejemplo');
  }
});

test('fetchInvitationPreview: configuracion invalida devuelve tarjeta generica sin llamar a fetchImpl', async () => {
  const recorder = createFetchRecorder(async () => {
    throw new Error('No debio llamarse fetchImpl');
  });

  const withoutFetch = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: null,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
  });
  assert.deepEqual(withoutFetch, genericPreview(ORIGIN, 'ABCDEFGHJK'));

  const withoutUrl = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: '',
    publishableKey: PUBLISHABLE_KEY,
  });
  assert.deepEqual(withoutUrl, genericPreview(ORIGIN, 'ABCDEFGHJK'));

  const withoutKey = await fetchInvitationPreview('abcde-fghjk', ORIGIN, {
    fetchImpl: recorder.fetchImpl,
    timeoutMs: 1500,
    supabaseUrl: SUPABASE_URL,
    publishableKey: '',
  });
  assert.deepEqual(withoutKey, genericPreview(ORIGIN, 'ABCDEFGHJK'));
  assert.equal(recorder.calls.length, 0);
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

test('SECURITY_HEADERS: coincide exactamente con los encabezados de src/web/_headers', () => {
  const parsedHeaders = parseRootHeadersFile();
  assert.equal(Object.keys(parsedHeaders).length, 4);
  assert.deepEqual(SECURITY_HEADERS, parsedHeaders);
});
