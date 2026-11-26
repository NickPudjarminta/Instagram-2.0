// Pulse — Node server: static app + JSON API (the same API runs on Cloudflare Workers, see worker/index.js).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { setHostResolver } from './net.js';

// In Node, block feeds that resolve to private / loopback addresses (SSRF guard).
setHostResolver(async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    });
    const response = await handleApi(request);
    const headers = Object.fromEntries(response.headers);
    return send(req, res, response.status, Buffer.from(await response.arrayBuffer()), headers);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, '{"error":"Method not allowed"}', { 'content-type': TYPES['.json'] });
  }
  return serveStatic(req, res, url.pathname);
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(req, res, 500, '{"error":"Internal error"}', { 'content-type': TYPES['.json'] });
      else res.end();
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createServer().listen(PORT, HOST, () => console.log(`Pulse running at http://localhost:${PORT}`));
}
