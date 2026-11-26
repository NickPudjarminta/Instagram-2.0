// Outbound HTTP helpers: URL validation, private-network blocking, timeouts and size caps.
// Runtime-neutral (Node 18+ and Cloudflare Workers): no Node built-ins are imported here.

const USER_AGENT =
  'Mozilla/5.0 (compatible; PulseNewsReader/2.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)';

const ALLOW_PRIVATE = globalThis.process?.env?.ALLOW_PRIVATE_HOSTS === '1';

// Video platforms are intentionally excluded: this app is a news reader, not a video feed.
const BLOCKED_HOSTS = [/(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i, /(^|\.)youtube-nocookie\.com$/i, /(^|\.)twitch\.tv$/i];

export function isVideoHost(hostname) {
  return BLOCKED_HOSTS.some((re) => re.test(hostname));
}

export function isVideoUrl(raw) {
  try {
    return isVideoHost(new URL(raw).hostname);
  } catch {
    return false;
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const isIPv4 = (ip) => IPV4.test(ip) && ip.split('.').every((n) => Number(n) <= 255);
export const isIPv6 = (ip) => ip.includes(':') && /^[0-9a-f:.]+$/i.test(ip);

export function isPrivateIp(ip) {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Parse and validate a user-supplied URL. Throws FetchError on anything unusable. */
export function parsePublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new FetchError('Invalid URL', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('Only http(s) URLs are allowed', 400);
  if (url.username || url.password) throw new FetchError('URLs with credentials are not allowed', 400);
  if (isVideoHost(url.hostname)) throw new FetchError('Video platforms are not supported', 400);
  if (!ALLOW_PRIVATE && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.internal'))) {
    throw new FetchError('Private hosts are not allowed', 400);
  }
  return url;
}

// Resolves a hostname to IP addresses. Node installs a DNS-based resolver (see server/index.js);
// on Cloudflare Workers outbound fetch cannot reach private networks, so only IP literals are checked.
let resolveHost = null;
export function setHostResolver(fn) {
  resolveHost = fn;
}

async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (isIPv4(host) || isIPv6(host)) addrs = [host];
  else if (resolveHost) {
    addrs = await resolveHost(host).catch(() => {
      throw new FetchError(`Could not resolve ${host}`, 502);
    });
  } else addrs = [];
  if (addrs.some((a) => isPrivateIp(a))) throw new FetchError('Private hosts are not allowed', 400);
}

/**
 * Fetch a URL as text. Redirects are followed manually so every hop is validated.
 * Returns { text, url, contentType }.
 */
export async function fetchText(raw, { timeout = 10_000, maxBytes = 4 * 1024 * 1024, accept = '*/*' } = {}) {
  let url = parsePublicUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    for (let hop = 0; hop < 6; hop++) {
      await assertPublicHost(url.hostname);
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-US,en;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = parsePublicUrl(new URL(res.headers.get('location'), url).href);
        continue;
      }
      if (!res.ok) throw new FetchError(`Upstream responded ${res.status}`, 502);
      const text = await readCapped(res, maxBytes);
      return { text, url: url.href, contentType: res.headers.get('content-type') || '' };
    }
    throw new FetchError('Too many redirects', 502);
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err.name === 'AbortError') throw new FetchError('Upstream timed out', 504);
    throw new FetchError(`Fetch failed: ${err.cause?.code || err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size >= maxBytes) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.byteLength, size - offset)), offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(out);
}

/** Run async tasks with a concurrency limit. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Tiny LRU cache with optional per-entry TTL. */
export class Lru {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}
