// Pulse — an Instagram-style news reader. Zero-framework Node server: JSON API + static app.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.js';
import { aggregate } from './feeds.js';
import { discover, preview } from './discover.js';
import { FetchError } from './net.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_FEEDS = 120;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(req, res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const type = headers['content-type'] || '';
  const compressible = /json|text|javascript|svg|manifest/.test(type) && buf.length > 1024;
  if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(status, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    res.end(zlib.gzipSync(buf, { level: 6 }));
  } else {
    res.writeHead(status, headers);
    res.end(buf);
  }
}

function json(req, res, status, data, extra = {}) {
  send(req, res, status, JSON.stringify(data), { 'content-type': TYPES['.json'], 'cache-control': 'no-store', ...extra });
}

async function readJson(req, limit = 128 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new FetchError('Request body too large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new FetchError('Invalid JSON', 400);
  }
}

const staticCache = new Map();
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA fallback
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT + path.sep)) return send(req, res, 403, 'Forbidden', { 'content-type': 'text/plain' });
  try {
    let entry = staticCache.get(file);
    const stat = await fs.stat(file);
    if (!entry || entry.mtime !== stat.mtimeMs) {
      const body = await fs.readFile(file);
      entry = { body, mtime: stat.mtimeMs, etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 16)}"` };
      staticCache.set(file, entry);
    }
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, { etag: entry.etag });
      return res.end();
    }
    send(req, res, 200, entry.body, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      etag: entry.etag,
      'x-content-type-options': 'nosniff',
    });
  } catch {
    send(req, res, 404, 'Not found', { 'content-type': 'text/plain' });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (pathname === '/api/catalog' && req.method === 'GET') {
    return json(req, res, 200, catalog(), { 'cache-control': 'public, max-age=300' });
  }

  if (pathname === '/api/feed' && req.method === 'POST') {
    const body = await readJson(req);
    const feeds = Array.isArray(body.feeds) ? body.feeds : [];
    const clean = feeds
      .filter((f) => f && typeof f.url === 'string' && typeof f.id === 'string')
      .slice(0, MAX_FEEDS)
      .map((f) => ({ id: f.id.slice(0, 200), url: f.url.slice(0, 2000) }));
    const data = await aggregate(clean, { perFeed: Math.min(Number(body.perFeed) || 25, 50) });
    return json(req, res, 200, { ...data, fetchedAt: Date.now() });
  }

  if (pathname === '/api/discover' && req.method === 'GET') {
    return json(req, res, 200, await discover(url.searchParams.get('q')));
  }

  if (pathname === '/api/preview' && req.method === 'GET') {
    const data = await preview(url.searchParams.get('url') || '');
    return json(req, res, 200, data, { 'cache-control': 'public, max-age=86400' });
  }

  if (pathname.startsWith('/api/')) return json(req, res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(req, res, 405, { error: 'Method not allowed' });
  return serveStatic(req, res, pathname);
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof FetchError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) json(req, res, status, { error: status === 500 ? 'Internal error' : err.message });
      else res.end();
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createServer().listen(PORT, HOST, () => console.log(`Pulse running at http://localhost:${PORT}`));
}
