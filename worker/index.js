// Cloudflare Worker entry: every request passes the password gate (worker/auth.js); then /api/* runs the shared API, everything else is served from ./public
// by Workers Static Assets (configured in wrangler.jsonc, with single-page-app fallback).
import { handleApi } from '../server/api.js';
import { setFeedStore } from '../server/feeds.js';
import { gate } from './auth.js';

// Feed results are kept in Cloudflare's edge cache so every isolate in a data centre shares them,
// instead of each one refetching every publisher.
const CACHE_ORIGIN = 'https://pulse-feed-cache.internal/';
setFeedStore({
  async get(url) {
    const hit = await caches.default.match(CACHE_ORIGIN + encodeURIComponent(url));
    return hit ? hit.json() : null;
  },
  async put(url, value) {
    const res = new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1800' },
    });
    await caches.default.put(CACHE_ORIGIN + encodeURIComponent(url), res);
  },
});

export default {
  async fetch(request, env, ctx) {
    const blocked = await gate(request, env);
    if (blocked) return blocked;

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Cache idempotent, publicly cacheable GETs (catalog, previews) at the edge.
    const cacheable = request.method === 'GET' && (url.pathname === '/api/preview' || url.pathname === '/api/catalog');
    if (cacheable) {
      const hit = await caches.default.match(request);
      if (hit) return hit;
    }
    const response = await handleApi(request);
    if (cacheable && response.ok) ctx.waitUntil(caches.default.put(request, response.clone()));
    return response;
  },
};
