// Turning whatever the user types into followable feeds, and fetching article preview images.
import { fetchText, FetchError, isVideoHost, Lru, parsePublicUrl } from './net.js';
import { decodeEntities, getFeed, parseFeed } from './feeds.js';

/** A hashtag becomes a live news search feed (Bing News RSS includes thumbnails). */
export function tagFeedUrl(tag) {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(tag)}&format=rss&setlang=en-US`;
}

export function redditFeedUrl(sub) {
  return `https://www.reddit.com/r/${encodeURIComponent(sub)}/top/.rss?t=day`;
}

export function normalizeTag(raw) {
  return String(raw).replace(/^#/, '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : '';
}

/** Find <link rel="alternate" type="application/rss+xml"> style feed links in an HTML page. */
export function findFeedLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, 'rel').toLowerCase();
    const type = attr(tag, 'type').toLowerCase();
    if (!rel.split(/\s+/).includes('alternate')) continue;
    if (!/(rss|atom|feed)\+xml|application\/xml|text\/xml/.test(type)) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    try {
      const url = new URL(href, base).href;
      if (/comments?\/feed|\/comments\b/i.test(url)) continue; // skip comment feeds
      out.push({ url, title: attr(tag, 'title') });
    } catch {
      /* ignore */
    }
  }
  return out;
}

const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds/posts/default', '/blog/feed', '/news/rss.xml'];

async function tryFeed(url, kind = 'rss', nameOverride) {
  const data = await getFeed(url);
  if (!data.items.length) throw new FetchError('Feed has no posts', 422);
  return {
    url,
    kind,
    name: nameOverride || data.title,
    site: data.link,
    sample: data.items.slice(0, 3).map(({ title, image }) => ({ title, image })),
  };
}

/**
 * Resolve a query into feeds. Accepts:
 *   #hashtag / "tag:foo"  -> news search feed
 *   r/subreddit           -> Reddit top posts feed
 *   feed URL              -> that feed
 *   website / domain      -> autodiscovered feeds
 */
export async function discover(query) {
  const q = String(query || '').trim();
  if (!q) throw new FetchError('Type a website, feed URL, #hashtag or r/subreddit', 400);

  if (q.startsWith('#') || /^tag:/i.test(q)) {
    const tag = normalizeTag(q.replace(/^tag:/i, ''));
    if (!tag) throw new FetchError('Empty hashtag', 400);
    return { feeds: [{ url: tagFeedUrl(tag), kind: 'tag', name: `#${tag.replace(/\s+/g, '')}`, tag, site: '' }] };
  }

  const sub = q.match(/^\/?r\/([A-Za-z0-9_]{2,21})\/?$/);
  if (sub) return { feeds: [await tryFeed(redditFeedUrl(sub[1]), 'reddit', `r/${sub[1]}`)] };

  if (!/^https?:\/\//i.test(q)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(q)) {
      // Not a URL: treat plain words as a hashtag search.
      return discover(`#${q}`);
    }
  }
  const url = parsePublicUrl(/^https?:\/\//i.test(q) ? q : `https://${q}`);
  if (isVideoHost(url.hostname)) throw new FetchError('Video platforms are not supported', 400);

  const page = await fetchText(url.href, { maxBytes: 2 * 1024 * 1024 });
  // The URL itself might already be a feed.
  try {
    const data = parseFeed(page.text, page.url);
    if (data.items.length) return { feeds: [await tryFeed(page.url, 'rss')] };
  } catch {
    /* not a feed, continue with HTML discovery */
  }

  const found = findFeedLinks(page.text, page.url);
  const candidates = found.length
    ? found.map((f) => f.url)
    : COMMON_PATHS.map((p) => new URL(p, page.url).href);
  const feeds = [];
  for (const c of [...new Set(candidates)].slice(0, 6)) {
    try {
      feeds.push(await tryFeed(c, 'rss'));
      if (!found.length) break; // probing common paths: first hit is enough
    } catch {
      /* try the next one */
    }
  }
  if (!feeds.length) throw new FetchError('No RSS or Atom feed found on that site', 404);
  return { feeds };
}

// ---------------------------------------------------------------------------
// Article preview images (og:image) for posts whose feed had no picture.

const ogCache = new Lru(3000);

export function extractPreview(html, base) {
  const head = html.slice(0, 300_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const find = (...keys) => {
    for (const key of keys) {
      for (const tag of metas) {
        const k = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
        if (k === key) {
          const v = attr(tag, 'content');
          if (v) return v;
        }
      }
    }
    return '';
  };
  let image = find('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image');
  if (!image) {
    const link = head.match(/<link\b[^>]*rel=["']image_src["'][^>]*>/i);
    if (link) image = attr(link[0], 'href');
  }
  try {
    image = image ? new URL(image, base).href.replace(/^http:\/\//, 'https://') : '';
  } catch {
    image = '';
  }
  return { image, description: find('og:description', 'description', 'twitter:description').slice(0, 500) };
}

export async function preview(rawUrl) {
  const key = parsePublicUrl(rawUrl).href;
  const hit = ogCache.get(key);
  if (hit) return hit;
  const pending = fetchText(key, { maxBytes: 600_000, timeout: 8000, accept: 'text/html' })
    .then((page) => extractPreview(page.text, page.url))
    .catch(() => ({ image: '', description: '' }));
  ogCache.set(key, pending);
  return pending;
}
