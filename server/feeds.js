// RSS / Atom / RDF parsing and normalisation into "posts" with images and short captions.
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { fetchText, isVideoUrl, Lru, mapLimit } from './net.js';

const ARRAY_TAGS = new Set(['item', 'entry', 'link', 'enclosure', 'category', 'media:content', 'media:thumbnail', 'media:group']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html) {
  return decodeEntities(
    String(html)
      .replace(/<(script|style|figure|figcaption|iframe|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function text(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return String(v).trim();
}

function arr(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function truncate(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

function absolutize(u, base) {
  if (!u) return '';
  try {
    return new URL(decodeEntities(u.trim()), base || undefined).href;
  } catch {
    return '';
  }
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;
const JUNK_IMG = /(feedburner|pixel|tracking|1x1|spacer|blank\.gif|gravatar\.com|\/emoji\/|wp-includes\/images\/smilies|doubleclick|stats\.wp)/i;

function isImageMedia(m) {
  const type = m['@_type'] || '';
  const medium = m['@_medium'] || '';
  const url = m['@_url'] || '';
  if (medium === 'video' || type.startsWith('video') || type.startsWith('audio')) return false;
  return medium === 'image' || type.startsWith('image') || IMG_EXT.test(url) || (!type && !medium && !!url);
}

function pickImage(item, html, base) {
  const candidates = [];
  const media = [...arr(item['media:content']), ...arr(item['media:group']).flatMap((g) => arr(g['media:content']))];
  for (const m of media) {
    if (isImageMedia(m)) candidates.push({ url: m['@_url'], w: Number(m['@_width']) || 0 });
  }
  candidates.sort((a, b) => b.w - a.w);
  for (const t of [...arr(item['media:thumbnail']), ...arr(item['media:group']).flatMap((g) => arr(g['media:thumbnail']))]) {
    candidates.push({ url: t['@_url'] });
  }
  for (const e of arr(item.enclosure)) {
    if (String(e['@_type'] || '').startsWith('image') || IMG_EXT.test(e['@_url'] || '')) candidates.push({ url: e['@_url'] });
  }
  if (item['itunes:image']?.['@_href']) candidates.push({ url: item['itunes:image']['@_href'] });
  // Bing News RSS exposes thumbnails as <News:Image>.
  const bingImg = text(item['News:Image'] || item['news:image']);
  if (bingImg) candidates.push({ url: bingImg.includes('bing.com/th') ? `${bingImg}&w=1080&h=720&c=7` : bingImg });
  if (html) {
    for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const tag = m[0];
      if (/\b(width|height)\s*=\s*["']?[0-3]["'\s/>]/i.test(tag)) continue;
      candidates.push({ url: m[1] });
      break;
    }
  }
  for (const c of candidates) {
    const url = absolutize(c.url, base);
    if (url && /^https?:/.test(url) && !JUNK_IMG.test(url)) return url.replace(/^http:\/\//, 'https://');
  }
  return '';
}

function pickLink(item, base) {
  const links = arr(item.link);
  // Atom: <link rel="alternate" href="..."/>
  const atom = links.find((l) => typeof l === 'object' && l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate'));
  let link = atom ? atom['@_href'] : text(links.find((l) => typeof l === 'string' || l?.['#text']) ?? '');
  if (!link) {
    const guid = item.guid;
    const g = text(guid);
    if (/^https?:\/\//.test(g)) link = g;
  }
  link = absolutize(link, base);
  // Unwrap aggregator redirect links (Bing News).
  try {
    const u = new URL(link);
    if (u.hostname.endsWith('bing.com') && u.pathname.includes('apiclick') && u.searchParams.get('url')) {
      link = u.searchParams.get('url');
    }
  } catch {
    /* ignore */
  }
  return link;
}

function pickAuthor(item) {
  const a = item['dc:creator'] ?? item.author ?? item['itunes:author'];
  if (a && typeof a === 'object' && !Array.isArray(a) && a.name) return text(a.name);
  const s = text(a);
  // RSS <author> is often "email (Name)".
  const m = s.match(/\(([^)]+)\)/);
  return truncate(m ? m[1] : s.includes('@') ? '' : s, 60);
}

function parseDate(item) {
  for (const k of ['pubDate', 'published', 'updated', 'dc:date', 'a10:updated', 'date']) {
    const v = text(item[k]);
    if (v) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return Math.min(t, Date.now());
    }
  }
  return 0;
}

export function hashId(s) {
  return crypto.createHash('sha1').update(s).digest('base64url').slice(0, 14);
}

/** Parse feed XML into { title, link, items[] }. Throws if the document is not a feed. */
export function parseFeed(xml, feedUrl = '') {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(`Not a valid feed (${err.message})`);
  }
  let channel, rawItems, kind;
  if (doc.rss) {
    channel = doc.rss.channel ? arr(doc.rss.channel)[0] : {};
    rawItems = arr(channel.item);
    kind = 'rss';
  } else if (doc.feed) {
    channel = doc.feed;
    rawItems = arr(channel.entry);
    kind = 'atom';
  } else if (doc['rdf:RDF']) {
    channel = arr(doc['rdf:RDF'].channel)[0] || {};
    rawItems = arr(doc['rdf:RDF'].item);
    kind = 'rdf';
  } else {
    throw new Error('Not an RSS or Atom feed');
  }

  const siteLink = pickLink(channel, feedUrl) || feedUrl;
  const items = [];
  for (const it of rawItems) {
    const link = pickLink(it, siteLink);
    if (!link || isVideoUrl(link)) continue; // never surface YouTube/Twitch posts
    const html = text(it['content:encoded']) || text(it.content) || text(it.description) || text(it.summary) || text(it['media:group']?.[0]?.['media:description']);
    const title = truncate(stripHtml(text(it.title)), 220);
    let excerpt = stripHtml(html);
    if (excerpt.startsWith(title)) excerpt = excerpt.slice(title.length).trim();
    excerpt = excerpt.replace(/\s*(The post .* appeared first on .*|Continue reading.*|Read more.*|\[…\]|\[\.\.\.\])$/i, '').trim();
    items.push({
      id: hashId(link),
      title: title || truncate(excerpt, 120) || 'Untitled',
      excerpt: truncate(excerpt, 420),
      link,
      image: pickImage(it, html, link),
      published: parseDate(it),
      author: pickAuthor(it),
      via: text(it['News:Source'] || it['news:source'] || it.source) || '',
      categories: arr(it.category).map((c) => text(c['@_term'] ?? c)).filter(Boolean).slice(0, 5),
    });
  }
  return { kind, title: stripHtml(text(channel.title)) || new URL(feedUrl || 'http://feed').hostname, link: siteLink, items };
}

// ---------------------------------------------------------------------------
// Fetching with a stale-while-revalidate cache.

const FEED_TTL = Number(process.env.FEED_TTL_MS) || 10 * 60 * 1000;
const feedCache = new Lru(400);

async function loadFeed(url) {
  const { text: xml, url: finalUrl } = await fetchText(url, {
    accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  });
  return parseFeed(xml, finalUrl);
}

export async function getFeed(url) {
  const hit = feedCache.get(url);
  const now = Date.now();
  if (hit?.data) {
    if (now - hit.at > FEED_TTL && !hit.pending) {
      hit.pending = loadFeed(url)
        .then((data) => feedCache.set(url, { at: Date.now(), data }))
        .catch(() => { hit.at = Date.now() - FEED_TTL / 2; }) // back off before retrying a failing feed
        .finally(() => { hit.pending = null; });
    }
    return hit.data;
  }
  if (hit?.pending) return hit.pending;
  const pending = loadFeed(url);
  feedCache.set(url, { at: 0, data: null, pending });
  try {
    const data = await pending;
    feedCache.set(url, { at: Date.now(), data });
    return data;
  } catch (err) {
    feedCache.map.delete(url);
    throw err;
  }
}

/**
 * Fetch many feeds and merge them into one newest-first timeline.
 * feeds: [{ id, url }]
 */
export async function aggregate(feeds, { perFeed = 25, max = 500 } = {}) {
  const errors = [];
  const results = await mapLimit(feeds, 8, async (f) => {
    try {
      const data = await getFeed(f.url);
      return data.items.slice(0, perFeed).map((it) => ({ ...it, sourceId: f.id }));
    } catch (err) {
      errors.push({ id: f.id, error: err.message });
      return [];
    }
  });
  const seenLinks = new Set();
  const seenTitles = new Set();
  const items = [];
  for (const it of results.flat().sort((a, b) => b.published - a.published)) {
    const tkey = it.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80);
    if (seenLinks.has(it.id) || (tkey.length > 20 && seenTitles.has(tkey))) continue;
    seenLinks.add(it.id);
    seenTitles.add(tkey);
    items.push(it);
    if (items.length >= max) break;
  }
  return { items, errors };
}
