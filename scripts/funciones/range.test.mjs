import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseRange } from '../../functions/_lib/range.mjs';

async function loadOnRequest() {
  const functionPath = path.resolve('functions/assets/video/[[path]].js');
  try {
    const mod = await import(pathToFileURL(functionPath).href);
    return mod.onRequest;
  } catch {
    const originalCode = fs.readFileSync(functionPath, 'utf8');
    const rangeUrl = pathToFileURL(path.resolve('functions/_lib/range.mjs')).href;
    const rewritten = originalCode.replace(
      /['"]\.\.\/\.\.\/_lib\/range\.mjs['"]/,
      JSON.stringify(rangeUrl)
    );
    const tempFile = path.join(
      os.tmpdir(),
      `onRequest-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
    );
    fs.writeFileSync(tempFile, rewritten, 'utf8');
    try {
      const mod = await import(pathToFileURL(tempFile).href);
      return mod.onRequest;
    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }
  }
}

const onRequest = await loadOnRequest();

// Datos de prueba: 1000 bytes con i % 256
const fakeData = new Uint8Array(1000);
for (let i = 0; i < 1000; i++) {
  fakeData[i] = i % 256;
}

function createFakeAssets(options = {}) {
  const { status = 200 } = options;
  let lastRequest = null;
  const fetch = async (req) => {
    lastRequest = req;
    if (status !== 200) {
      return new Response(null, { status });
    }
    return new Response(fakeData.slice(), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        ETag: '"abc"',
      },
    });
  };
  return {
    get lastRequest() {
      return lastRequest;
    },
    fetch,
  };
}

test('parseRange: null, undefined, vacio y solo espacios devuelven none', () => {
  assert.deepStrictEqual(parseRange(null, 1000), { type: 'none' });
  assert.deepStrictEqual(parseRange(undefined, 1000), { type: 'none' });
  assert.deepStrictEqual(parseRange('', 1000), { type: 'none' });
  assert.deepStrictEqual(parseRange('   ', 1000), { type: 'none' });
});

test('parseRange: rangos cerrados validos a-b', () => {
  assert.deepStrictEqual(parseRange('bytes=0-1', 1000), { type: 'range', start: 0, end: 1 });
  assert.deepStrictEqual(parseRange('bytes=0-0', 1000), { type: 'range', start: 0, end: 0 });
  assert.deepStrictEqual(parseRange('bytes=100-199', 1000), { type: 'range', start: 100, end: 199 });
});

test('parseRange: se recorta al final si supera size - 1', () => {
  assert.deepStrictEqual(parseRange('bytes=990-2000', 1000), { type: 'range', start: 990, end: 999 });
});

test('parseRange: rangos abiertos a-', () => {
  assert.deepStrictEqual(parseRange('bytes=500-', 1000), { type: 'range', start: 500, end: 999 });
  assert.deepStrictEqual(parseRange('bytes=0-', 1000), { type: 'range', start: 0, end: 999 });
  assert.deepStrictEqual(parseRange('bytes=999-', 1000), { type: 'range', start: 999, end: 999 });
});

test('parseRange: sufijos -n', () => {
  assert.deepStrictEqual(parseRange('bytes=-100', 1000), { type: 'range', start: 900, end: 999 });
  assert.deepStrictEqual(parseRange('bytes=-5000', 1000), { type: 'range', start: 0, end: 999 });
});

test('parseRange: casos insatisfacibles por limites o cero', () => {
  assert.deepStrictEqual(parseRange('bytes=-0', 1000), { type: 'unsatisfiable' });
  assert.deepStrictEqual(parseRange('bytes=1000-', 1000), { type: 'unsatisfiable' });
  assert.deepStrictEqual(parseRange('bytes=1000-1001', 1000), { type: 'unsatisfiable' });
  assert.deepStrictEqual(parseRange('bytes=5-2', 1000), { type: 'unsatisfiable' });
});

test('parseRange: sintaxis mal formada o unidad no valida', () => {
  const malformed = [
    'bytes=abc',
    'bytes=-',
    'bytes=',
    'bytes=1-2-3',
    'bytes=1.5-3',
    'bytes=+1-3',
    'items=0-1',
    '0-1',
  ];
  for (const item of malformed) {
    assert.deepStrictEqual(parseRange(item, 1000), { type: 'unsatisfiable' }, `Fallo en: ${item}`);
  }
});

test('parseRange: multiples rangos evaluan solo el primero', () => {
  assert.deepStrictEqual(parseRange('bytes=0-1, 5-9', 1000), { type: 'range', start: 0, end: 1 });
  assert.deepStrictEqual(parseRange('bytes=5-9,0-1', 1000), { type: 'range', start: 5, end: 9 });
});

test('parseRange: tolera espacios y mayusculas en la unidad', () => {
  assert.deepStrictEqual(parseRange('  bytes = 0 - 1 ', 1000), { type: 'range', start: 0, end: 1 });
  assert.deepStrictEqual(parseRange('Bytes=0-1', 1000), { type: 'range', start: 0, end: 1 });
});

test('parseRange: size <= 0 devuelve unsatisfiable con cualquier rango', () => {
  assert.deepStrictEqual(parseRange('bytes=0-1', 0), { type: 'unsatisfiable' });
});

test('parseRange: enteros no seguros devuelven unsatisfiable', () => {
  assert.deepStrictEqual(parseRange('bytes=99999999999999999999-', 1000), { type: 'unsatisfiable' });
});

test('onRequest: GET sin Range -> 200 completo con cabeceras requeridas', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', { method: 'GET' });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('Accept-Ranges'), 'bytes');
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.strictEqual(response.headers.get('ETag'), '"abc"');
  assert.strictEqual(response.headers.get('Content-Type'), 'video/mp4');
  assert.strictEqual(response.headers.get('Content-Length'), '1000');

  const body = new Uint8Array(await response.arrayBuffer());
  assert.strictEqual(body.byteLength, 1000);
  assert.deepStrictEqual(body, fakeData);
});

test('onRequest: GET con Range: bytes=0-1 -> 206 y 2 bytes [0, 1]', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: { Range: 'bytes=0-1' },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 206);
  assert.strictEqual(response.headers.get('Content-Range'), 'bytes 0-1/1000');
  assert.strictEqual(response.headers.get('Content-Length'), '2');

  const body = new Uint8Array(await response.arrayBuffer());
  assert.deepStrictEqual(body, new Uint8Array([0, 1]));

  assert.strictEqual(fakeAssets.lastRequest.method, 'GET');
  assert.strictEqual(fakeAssets.lastRequest.headers.has('range'), false);
});

test('onRequest: GET con Range: bytes=-10 -> 206 y bytes 990..999', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: { Range: 'bytes=-10' },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 206);
  assert.strictEqual(response.headers.get('Content-Range'), 'bytes 990-999/1000');
  assert.strictEqual(response.headers.get('Content-Length'), '10');

  const body = new Uint8Array(await response.arrayBuffer());
  assert.deepStrictEqual(body, fakeData.slice(990, 1000));
});

test('onRequest: GET con Range: bytes=2000- -> 416 sin cuerpo', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: { Range: 'bytes=2000-' },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 416);
  assert.strictEqual(response.headers.get('Content-Range'), 'bytes */1000');
  assert.strictEqual(response.headers.get('Accept-Ranges'), 'bytes');
  assert.strictEqual(response.headers.get('Cache-Control'), 'no-store');
  assert.strictEqual(response.headers.has('Content-Type'), false);
  assert.strictEqual(response.headers.has('ETag'), false);

  const body = await response.arrayBuffer();
  assert.strictEqual(body.byteLength, 0);
});

test('onRequest: HEAD con Range: bytes=0-1 -> 206 con mismas cabeceras y cuerpo vacio', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    method: 'HEAD',
    headers: { Range: 'bytes=0-1' },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 206);
  assert.strictEqual(response.headers.get('Content-Range'), 'bytes 0-1/1000');
  assert.strictEqual(response.headers.get('Content-Length'), '2');
  assert.strictEqual(response.headers.get('Accept-Ranges'), 'bytes');
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.strictEqual(response.headers.get('ETag'), '"abc"');
  assert.strictEqual(response.headers.get('Content-Type'), 'video/mp4');

  const body = await response.arrayBuffer();
  assert.strictEqual(body.byteLength, 0);

  assert.strictEqual(fakeAssets.lastRequest.method, 'GET');
  assert.strictEqual(fakeAssets.lastRequest.headers.has('range'), false);
});

test('onRequest: If-None-Match: "abc" -> 304', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: { 'If-None-Match': '"abc"' },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 304);
  assert.strictEqual(response.headers.get('Accept-Ranges'), 'bytes');
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.strictEqual(response.headers.get('ETag'), '"abc"');

  const body = await response.arrayBuffer();
  assert.strictEqual(body.byteLength, 0);
});

test('onRequest: If-Range: "otro" con Range: bytes=0-1 -> 200 completo', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: {
      'If-Range': '"otro"',
      Range: 'bytes=0-1',
    },
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('Content-Length'), '1000');
  const body = await response.arrayBuffer();
  assert.strictEqual(body.byteLength, 1000);
});

test('onRequest: el ASSETS falso recibe siempre una peticion GET sin cabecera Range', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    headers: { Range: 'bytes=50-100', 'If-None-Match': '"xyz"' },
  });
  await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(fakeAssets.lastRequest.method, 'GET');
  assert.strictEqual(fakeAssets.lastRequest.headers.has('range'), false);
  assert.strictEqual(fakeAssets.lastRequest.headers.has('if-none-match'), false);
});

test('onRequest: si ASSETS devuelve 404, la funcion devuelve ese 404', async () => {
  const fakeAssets = createFakeAssets({ status: 404 });
  const request = new Request('https://convite.test/assets/video/no-existe.mp4', { method: 'GET' });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(response.status, 404);
});

test('onRequest: POST -> se pasa la peticion original a ASSETS', async () => {
  const fakeAssets = createFakeAssets();
  const request = new Request('https://convite.test/assets/video/intro.mp4', {
    method: 'POST',
    body: 'payload',
  });
  const response = await onRequest({ request, env: { ASSETS: fakeAssets } });

  assert.strictEqual(fakeAssets.lastRequest, request);
  assert.strictEqual(fakeAssets.lastRequest.method, 'POST');
});
