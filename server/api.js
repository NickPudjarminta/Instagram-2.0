// JSON API built on web-standard Request/Response, shared by the Node server and the Cloudflare Worker.
import { catalog } from './catalog.js';
import { aggregate } from './feeds.js';
import { discover, preview } from './discover.js';
import { FetchError } from './net.js';

const MAX_FEEDS = 120;
const MAX_BODY = 128 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new FetchError('Request body too large', 413);
  const text = await request.text();
  if (text.length > MAX_BODY) throw new FetchError('Request body too large', 413);
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new FetchError('Invalid JSON', 400);
  }
}

async function route(request, url) {
  const { pathname, searchParams } = url;
  const method = request.method;

  if (pathname === '/api/catalog' && method === 'GET') {
    return json(catalog(), 200, { 'cache-control': 'public, max-age=300' });
  }

  if (pathname === '/api/feed' && method === 'POST') {
    const body = await readJson(request);
    const feeds = (Array.isArray(body.feeds) ? body.feeds : [])
      .filter((f) => f && typeof f.url === 'string' && typeof f.id === 'string')
      .slice(0, MAX_FEEDS)
      .map((f) => ({ id: f.id.slice(0, 200), url: f.url.slice(0, 2000) }));
    const data = await aggregate(feeds, { perFeed: Math.min(Number(body.perFeed) || 25, 50) });
    return json({ ...data, fetchedAt: Date.now() });
  }

  if (pathname === '/api/discover' && method === 'GET') {
    return json(await discover(searchParams.get('q')));
  }

  if (pathname === '/api/preview' && method === 'GET') {
    const data = await preview(searchParams.get('url') || '');
    return json(data, 200, { 'cache-control': 'public, max-age=86400' });
  }

  return json({ error: 'Not found' }, 404);
}

/** Handle an /api/* request. Never throws: errors become JSON responses. */
export async function handleApi(request) {
  const url = new URL(request.url);
  try {
    return await route(request, url);
  } catch (err) {
    const status = err instanceof FetchError ? err.status : 500;
    if (status === 500) console.error(err);
    return json({ error: status === 500 ? 'Internal error' : err.message }, status);
  }
}
