// Los rastreadores de vista previa no ejecutan JavaScript y _headers no se aplica a respuestas de Functions.

import { fetchInvitationPreview, SECURITY_HEADERS } from '../_lib/preview.mjs';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PREVIEW_TIMEOUT_MS } from '../_lib/config.mjs';

function setMetaContent(value) {
  return {
    element(el) {
      el.setAttribute('content', value);
    },
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return env.ASSETS.fetch(request);
  }

  try {
    // Sin los encabezados del cliente: un If-None-Match daría un 304 sin las etiquetas del evento.
    const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
    const contentType = (asset.headers.get('content-type') || '').toLowerCase();
    if (asset.status !== 200 || !contentType.startsWith('text/html')) {
      return asset;
    }

    const origin = new URL(request.url).origin;
    const preview = await fetchInvitationPreview(params?.code, origin, {
      fetchImpl: fetch,
      timeoutMs: PREVIEW_TIMEOUT_MS,
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
    });

    const headers = new Headers(asset.headers);
    headers.delete('Link');
    headers.delete('Content-Length');
    headers.delete('ETag');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    headers.set('Cache-Control', 'no-cache');

    if (request.method === 'HEAD') {
      if (typeof asset.body?.cancel === 'function') {
        Promise.resolve(asset.body.cancel()).catch(() => {});
      }
      return new Response(null, { status: 200, headers });
    }

    const transformed = new HTMLRewriter()
      .on('title', {
        element(el) {
          el.setInnerContent(preview.title);
        },
      })
      .on('meta[property="og:title"]', setMetaContent(preview.title))
      .on('meta[property="og:description"]', setMetaContent(preview.description))
      .on('meta[name="description"]', setMetaContent(preview.description))
      .on('meta[property="og:url"]', setMetaContent(preview.url))
      .on('meta[property="og:image"]', setMetaContent(preview.image))
      .transform(asset);

    return new Response(transformed.body, { status: 200, headers });
  } catch {
    return env.ASSETS.fetch(request);
  }
}
