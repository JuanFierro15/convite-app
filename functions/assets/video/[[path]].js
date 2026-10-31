// Safari en iOS requiere respuestas 206 (Partial Content) para reproducir video MP4
// y Cloudflare Pages responde 200 con el archivo completo por defecto.

import { parseRange } from '../../_lib/range.mjs';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return env.ASSETS.fetch(request);
  }

  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
  if (asset.status !== 200) {
    return asset;
  }

  const body = await asset.arrayBuffer();
  const size = body.byteLength;

  const headers = new Headers();
  const contentType = asset.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  const etag = asset.headers.get('etag');
  if (etag) {
    headers.set('ETag', etag);
  }
  const lastModified = asset.headers.get('last-modified');
  if (lastModified) {
    headers.set('Last-Modified', lastModified);
  }
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch) {
    const assetEtag = headers.get('ETag');
    const normalizedAssetEtag = assetEtag ? (assetEtag.startsWith('W/') ? assetEtag.slice(2) : assetEtag) : null;
    const values = ifNoneMatch.split(',').map((val) => val.trim());
    const matches = values.some((val) => {
      if (val === '*') return true;
      if (!normalizedAssetEtag) return false;
      const norm = val.startsWith('W/') ? val.slice(2) : val;
      return norm === normalizedAssetEtag;
    });
    if (matches) {
      return new Response(null, { status: 304, headers });
    }
  }

  let rangeHeader = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  if (ifRange) {
    const assetEtag = headers.get('ETag');
    if (!assetEtag || ifRange.trim() !== assetEtag.trim()) {
      rangeHeader = null;
    }
  }

  const parsed = parseRange(rangeHeader, size);

  if (parsed.type === 'unsatisfiable') {
    const errorHeaders = new Headers();
    errorHeaders.set('Accept-Ranges', 'bytes');
    errorHeaders.set('Cache-Control', 'no-store');
    errorHeaders.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers: errorHeaders });
  }

  const isHead = request.method === 'HEAD';

  if (parsed.type === 'none') {
    headers.set('Content-Length', String(size));
    return new Response(isHead ? null : body, { status: 200, headers });
  }

  const { start, end } = parsed;
  const chunkLength = end - start + 1;
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(chunkLength));

  const slice = body.slice(start, end + 1);
  return new Response(isHead ? null : slice, { status: 206, headers });
}
