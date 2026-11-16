import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GENERIC_TITLE,
  GENERIC_DESCRIPTION,
  DEFAULT_THEME,
} from '../../functions/_lib/preview.mjs';

const ORIGIN = 'https://convite-4v8.pages.dev';
const REQUEST_URL = `${ORIGIN}/i/abcde-fghjk`;

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

const EXPECTED_SECURITY_HEADERS = parseRootHeadersFile();
assert.equal(Object.keys(EXPECTED_SECURITY_HEADERS).length, 4);

const { onRequest } = await import(pathToFileURL(path.resolve('functions/i/[code].js')).href);

function createFakeAssets(handler) {
  const calls = [];
  return {
    calls,
    async fetch(req) {
      calls.push(req);
      return handler(req, calls.length);
    },
  };
}

function createHtmlAsset() {
  return new Response('<html><head><title>Convite</title></head><body></body></html>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      link: '</main.js>; rel=preload',
      etag: '"abc"',
      'content-length': '63',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}

function installGlobals(t, { fetchImpl, rewriterThrows = false } = {}) {
  const originalFetch = globalThis.fetch;
  const hasHTMLRewriter = Object.prototype.hasOwnProperty.call(globalThis, 'HTMLRewriter');
  const originalHTMLRewriter = globalThis.HTMLRewriter;

  const fetchCalls = [];
  const rewriterCalls = [];

  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (fetchImpl) {
      return fetchImpl(url, options);
    }
    return new Response('null', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  globalThis.HTMLRewriter = class FakeHTMLRewriter {
    constructor() {
      this.handlers = [];
    }

    on(selector, handler) {
      this.handlers.push([selector, handler]);
      return this;
    }

    transform(response) {
      if (rewriterThrows) {
        throw new Error('Fallo simulado en HTMLRewriter');
      }
      const applied = {};
      for (const [selector, handler] of this.handlers) {
        handler.element({
          setAttribute: (attr, value) => {
            applied[selector] = { attr, value };
          },
          setInnerContent: (value) => {
            applied[selector] = { innerContent: value };
          },
        });
      }
      rewriterCalls.push(applied);
      return new Response(response.body, response);
    }
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (hasHTMLRewriter) {
      globalThis.HTMLRewriter = originalHTMLRewriter;
    } else {
      delete globalThis.HTMLRewriter;
    }
  });

  return { fetchCalls, rewriterCalls };
}

test('onRequest GET con HTML 200: lanza RPC en paralelo, aplica etiquetas OG, seguridad y no-cache', async (t) => {
  const { fetchCalls, rewriterCalls } = installGlobals(t, {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          invitation: { group_name: 'Familia Ejemplo' },
          event: {
            name: 'Baby Shower Ejemplo',
            theme_id: 'honey-bee',
            starts_at: '2026-11-29T20:00:00Z',
            venue_name: 'Salón Las Palmas',
            city: 'Neiva',
          },
          guests: [{ full_name: 'Invitado Ejemplo' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
  });

  let fetchCallsWhenAssetsStarted = -1;
  const assets = createFakeAssets(async () => {
    fetchCallsWhenAssetsStarted = fetchCalls.length;
    return createHtmlAsset();
  });

  const request = new Request(REQUEST_URL, { method: 'GET' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'abcde-fghjk' },
  });

  assert.equal(fetchCallsWhenAssetsStarted, 1);
  assert.equal(res.status, 200);

  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assert.equal(res.headers.get(name), value);
  }
  assert.equal(res.headers.get('Cache-Control'), 'no-cache');
  assert.equal(res.headers.has('Link'), false);
  assert.equal(res.headers.has('ETag'), false);
  assert.equal(res.headers.has('Content-Length'), false);

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { p_code: 'ABCDEFGHJK' });

  const expectedDescription =
    'Domingo 29 de noviembre, 3:00 p. m. · Salón Las Palmas, Neiva. Abre el enlace para ver tu invitación y confirmar.';
  assert.deepEqual(rewriterCalls, [
    {
      title: { innerContent: 'Baby Shower Ejemplo' },
      'meta[property="og:title"]': { attr: 'content', value: 'Baby Shower Ejemplo' },
      'meta[property="og:description"]': { attr: 'content', value: expectedDescription },
      'meta[name="description"]': { attr: 'content', value: expectedDescription },
      'meta[property="og:url"]': { attr: 'content', value: `${ORIGIN}/i/ABCDEFGHJK` },
      'meta[property="og:image"]': {
        attr: 'content',
        value: `${ORIGIN}/assets/og/honey-bee.v1.jpg`,
      },
    },
  ]);
});

test('onRequest: la peticion a ASSETS es GET y omite el If-None-Match del cliente', async (t) => {
  installGlobals(t);
  const assets = createFakeAssets(() => createHtmlAsset());

  const request = new Request(REQUEST_URL, {
    method: 'GET',
    headers: { 'If-None-Match': '"abc"' },
  });

  await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'ABCDEFGHJK' },
  });

  assert.equal(assets.calls.length, 1);
  assert.equal(assets.calls[0].method, 'GET');
  assert.equal(assets.calls[0].headers.has('if-none-match'), false);
});

test('onRequest HEAD: devuelve 200, cuerpo null, encabezados de seguridad y 0 llamadas a fetch', async (t) => {
  const { fetchCalls, rewriterCalls } = installGlobals(t, {
    fetchImpl: async () => {
      throw new Error('HEAD no debe consultar Supabase');
    },
  });
  const assets = createFakeAssets(() => createHtmlAsset());

  const request = new Request(REQUEST_URL, { method: 'HEAD' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'ABCDEFGHJK' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body, null);
  assert.equal(await res.text(), '');
  assert.equal(fetchCalls.length, 0);
  assert.equal(rewriterCalls.length, 0);

  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assert.equal(res.headers.get(name), value);
  }
  assert.equal(res.headers.get('Cache-Control'), 'no-cache');
  assert.equal(res.headers.has('Link'), false);
  assert.equal(res.headers.has('ETag'), false);
  assert.equal(res.headers.has('Content-Length'), false);
});

test('onRequest POST: pasa la peticion original a ASSETS y devuelve su respuesta exacta', async (t) => {
  const { fetchCalls } = installGlobals(t);
  const assetsResponse = new Response('Method Not Allowed', { status: 405 });
  const assets = createFakeAssets(() => assetsResponse);

  const request = new Request(REQUEST_URL, { method: 'POST', body: 'x' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'ABCDEFGHJK' },
  });

  assert.equal(assets.calls.length, 1);
  assert.equal(assets.calls[0], request);
  assert.equal(res, assetsResponse);
  assert.equal(fetchCalls.length, 0);
});

test('onRequest: si ASSETS responde 404, 304 o image/png devuelve esa misma respuesta', async (t) => {
  installGlobals(t);

  const cases = [
    new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    new Response(null, { status: 304 }),
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
  ];

  for (const expectedResponse of cases) {
    const assets = createFakeAssets(() => expectedResponse);
    const request = new Request(REQUEST_URL, { method: 'GET' });
    const res = await onRequest({
      request,
      env: { ASSETS: assets },
      params: { code: 'ABCDEFGHJK' },
    });

    assert.equal(res, expectedResponse);
  }
});

test('onRequest: si ASSETS lanza en la primera llamada devuelve el fallback de ASSETS.fetch(request)', async (t) => {
  installGlobals(t);
  const fallbackResponse = new Response('fallback html', { status: 200 });
  const assets = createFakeAssets((req, callNumber) => {
    if (callNumber === 1) {
      throw new Error('ASSETS caido');
    }
    return fallbackResponse;
  });

  const request = new Request(REQUEST_URL, { method: 'GET' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'ABCDEFGHJK' },
  });

  assert.equal(assets.calls.length, 2);
  assert.equal(assets.calls[1], request);
  assert.equal(res, fallbackResponse);
});

test('onRequest: si HTMLRewriter.transform lanza devuelve ASSETS.fetch(request)', async (t) => {
  installGlobals(t, { rewriterThrows: true });
  const fallbackResponse = new Response('fallback html', { status: 200 });
  const assets = createFakeAssets((req, callNumber) => {
    if (callNumber === 1) {
      return createHtmlAsset();
    }
    return fallbackResponse;
  });

  const request = new Request(REQUEST_URL, { method: 'GET' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'ABCDEFGHJK' },
  });

  assert.equal(assets.calls.length, 2);
  assert.equal(assets.calls[1], request);
  assert.equal(res, fallbackResponse);
});

test('onRequest: codigo invalido (/i/abc) usa etiquetas genericas y hace 0 llamadas a fetch', async (t) => {
  const { fetchCalls, rewriterCalls } = installGlobals(t, {
    fetchImpl: async () => {
      throw new Error('No debe llamar a fetch con codigo invalido');
    },
  });
  const assets = createFakeAssets(() => createHtmlAsset());

  const request = new Request(`${ORIGIN}/i/abc`, { method: 'GET' });
  const res = await onRequest({
    request,
    env: { ASSETS: assets },
    params: { code: 'abc' },
  });

  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(rewriterCalls, [
    {
      title: { innerContent: GENERIC_TITLE },
      'meta[property="og:title"]': { attr: 'content', value: GENERIC_TITLE },
      'meta[property="og:description"]': { attr: 'content', value: GENERIC_DESCRIPTION },
      'meta[name="description"]': { attr: 'content', value: GENERIC_DESCRIPTION },
      'meta[property="og:url"]': { attr: 'content', value: `${ORIGIN}/` },
      'meta[property="og:image"]': {
        attr: 'content',
        value: `${ORIGIN}/assets/og/${DEFAULT_THEME}.v1.jpg`,
      },
    },
  ]);
});
