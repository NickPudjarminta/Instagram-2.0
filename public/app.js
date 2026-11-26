// Pulse — Instagram-style news feed. Vanilla JS, no build step.

// ---------------------------------------------------------------------------
// Utilities

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const bgStyle = (u) => (safeUrl(u) ? `background-image:url("${safeUrl(u).replace(/["\\\n]/g, encodeURIComponent)}")` : '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`pulse:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`pulse:${key}`, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const gradientFor = (key) => {
  const h = hash(key) % 360;
  return `--c1:hsl(${h} 72% 46%);--c2:hsl(${(h + 48) % 360} 78% 30%)`;
};
const avatarBg = (key) => `hsl(${hash(key) % 360} 55% 45%)`;

function timeAgo(ts, long = false) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  const units = [[60, 'second', 's'], [3600, 'minute', 'm'], [86400, 'hour', 'h'], [604800, 'day', 'd'], [2629800, 'week', 'w']];
  if (s < 45) return long ? 'just now' : 'now';
  let prev = 1;
  for (const [limit, word, short] of units) {
    if (s < limit) {
      const n = Math.floor(s / prev);
      return long ? `${n} ${word}${n === 1 ? '' : 's'} ago` : `${n}${short}`;
    }
    prev = limit;
  }
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 31557600 ? 'numeric' : undefined });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke based)

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.6L6 21z"/>',
  heart: '<path d="M12 20.5s-7.6-4.6-9.3-9.5C1.5 7.5 3.7 4 7.3 4c2 0 3.6 1.1 4.7 2.8C13.1 5.1 14.7 4 16.7 4c3.6 0 5.8 3.5 4.6 7-1.7 4.9-9.3 9.5-9.3 9.5z"/>',
  send: '<path d="M22 3 10 14M22 3l-7 18-3.4-7.6L3 10z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
  grid: '<path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7"/>',
  hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
  rss: '<path d="M5 19h.01M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke-width="2.2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
function hydrateIcons(root = document) {
  for (const el of $$('i[data-icon]', root)) el.outerHTML = icon(el.dataset.icon);
}

// ---------------------------------------------------------------------------
// State

const state = {
  catalog: { topics: [], sources: [], suggestedTags: [] },
  follows: store.get('follows', null), // { sources: [catalogId], custom: [{ id, name, url, kind, site, topic, tag }] }
  liked: new Map(store.get('liked', []).map((it) => [it.id, it])),
  saved: new Map(store.get('saved', []).map((it) => [it.id, it])),
  hidden: new Set(store.get('hidden', [])),
  seen: new Set(store.get('seen', [])),
  previews: new Map(Object.entries(store.get('previews', {}))),
  timeline: store.get('timeline', { items: [], at: 0 }),
  loading: false,
  fresh: null, // items from a background refresh waiting to be shown
  homeTopic: 'all',
  exploreCache: new Map(),
};

const sourceById = new Map();

function persistFollows() { store.set('follows', state.follows); }
function persistMapCapped(key, map, cap = 400) { store.set(key, [...map.values()].slice(-cap)); }

function allSources() {
  const out = new Map(sourceById);
  for (const c of state.follows?.custom || []) out.set(c.id, c);
  return out;
}

function sourceMeta(id, item) {
  const s = sourceById.get(id) || state.follows?.custom.find((c) => c.id === id);
  if (s) return s;
  if (String(id).startsWith('tag:')) return { id, kind: 'tag', tag: id.slice(4), name: `#${id.slice(4).replace(/\s+/g, '')}`, topic: 'tags' };
  return { id, name: item?.via || hostOf(item?.link) || id, site: item?.link, topic: '' };
}

function isFollowing(id) {
  return !!state.follows && (state.follows.sources.includes(id) || state.follows.custom.some((c) => c.id === id));
}

function followedFeeds() {
  if (!state.follows) return [];
  const out = [];
  for (const id of state.follows.sources) {
    const s = sourceById.get(id);
    if (s) out.push({ id, url: s.url });
  }
  for (const c of state.follows.custom) out.push({ id: c.id, url: c.url });
  return out;
}

function topicOf(id) {
  const s = sourceMeta(id);
  if (s.kind === 'tag') return 'tags';
  return s.topic || 'other';
}

function follow(id) {
  if (!state.follows) state.follows = { sources: [], custom: [] };
  if (sourceById.has(id) && !state.follows.sources.includes(id)) state.follows.sources.push(id);
  persistFollows();
}

function followCustom(feed) {
  if (!state.follows) state.follows = { sources: [], custom: [] };
  const catalogMatch = state.catalog.sources.find((s) => s.url === feed.url);
  if (catalogMatch) return follow(catalogMatch.id), catalogMatch.id;
  const id = feed.kind === 'tag' ? `tag:${feed.tag.toLowerCase()}` : `custom:${hash(feed.url).toString(36)}`;
  if (!state.follows.custom.some((c) => c.id === id)) {
    state.follows.custom.push({
      id, name: feed.name, url: feed.url, kind: feed.kind || 'rss', site: feed.site || '',
      topic: feed.kind === 'tag' ? 'tags' : feed.topic || 'other', tag: feed.tag,
    });
  }
  persistFollows();
  return id;
}

function unfollow(id) {
  if (!state.follows) return;
  state.follows.sources = state.follows.sources.filter((x) => x !== id);
  state.follows.custom = state.follows.custom.filter((c) => c.id !== id);
  persistFollows();
  state.timeline.items = state.timeline.items.filter((it) => it.sourceId !== id);
}

// ---------------------------------------------------------------------------
// Data loading

async function loadTimeline({ background = false } = {}) {
  const feeds = followedFeeds();
  if (!feeds.length) {
    state.timeline = { items: [], at: Date.now() };
    return;
  }
  state.loading = !background;
  try {
    const data = await api('/api/feed', { feeds });
    const followedIds = new Set(feeds.map((f) => f.id));
    const items = data.items.filter((it) => followedIds.has(it.sourceId));
    if (background && state.timeline.items.length) {
      state.timeline.at = data.fetchedAt;
      const known = new Set(state.timeline.items.map((it) => it.id));
      const fresh = items.filter((it) => !known.has(it.id));
      if (fresh.length) {
        state.fresh = items;
        showNewPill(fresh.length);
      }
    } else {
      state.timeline = { items, at: data.fetchedAt };
    }
    store.set('timeline', { items: items.slice(0, 150), at: data.fetchedAt });
    if (data.errors?.length) console.warn('Some feeds failed:', data.errors);
  } finally {
    state.loading = false;
  }
}

async function loadFeeds(feeds, cacheKey, perFeed = 25) {
  const hit = state.exploreCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.items;
  const data = await api('/api/feed', { feeds, perFeed });
  state.exploreCache.set(cacheKey, { at: Date.now(), items: data.items });
  return data.items;
}

// Lazy article previews: when a post without an image scrolls near the viewport, ask the
// server for the article's og:image and swap it in.
const previewQueue = [];
let previewActive = 0;
const previewObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    previewObserver.unobserve(e.target);
    previewQueue.push(e.target);
  }
  pumpPreviews();
}, { rootMargin: '600px 0px' });

function pumpPreviews() {
  while (previewActive < 4 && previewQueue.length) {
    const el = previewQueue.shift();
    const link = el.dataset.link;
    previewActive++;
    getPreview(link)
      .then((p) => { if (p.image) applyImage(el, p.image); })
      .finally(() => { previewActive--; pumpPreviews(); });
  }
}

let previewSaveTimer;
async function getPreview(link) {
  if (state.previews.has(link)) return { image: state.previews.get(link) };
  const p = await api(`/api/preview?url=${encodeURIComponent(link)}`).catch(() => ({ image: '' }));
  state.previews.set(link, p.image || '');
  clearTimeout(previewSaveTimer);
  previewSaveTimer = setTimeout(() => store.set('previews', Object.fromEntries([...state.previews].slice(-400))), 1000);
  return p;
}

function applyImage(mediaEl, url) {
  if (!safeUrl(url) || $('img', mediaEl)) return;
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => {
    if (mediaEl.classList.contains('post-media') && img.naturalWidth) {
      const ratio = Math.min(1.91, Math.max(0.8, img.naturalWidth / img.naturalHeight));
      mediaEl.style.aspectRatio = String(ratio);
    }
    mediaEl.classList.add('has-img');
    img.classList.add('loaded');
  };
  img.onerror = () => {
    img.remove();
    mediaEl.classList.remove('has-img');
    if (!mediaEl.dataset.triedPreview) {
      mediaEl.dataset.triedPreview = '1';
      previewObserver.observe(mediaEl);
    }
  };
  img.src = url;
  mediaEl.prepend(img);
  // remember for re-renders
  for (const list of [state.timeline.items, ...[...state.exploreCache.values()].map((v) => v.items)]) {
    const it = list.find((x) => x.link === mediaEl.dataset.link);
    if (it && !it.image) it.image = url;
  }
}

function wireMedia(root) {
  for (const el of $$('[data-media]', root)) {
    const img = el.dataset.img;
    if (img) {
      el.dataset.triedPreview = state.previews.has(el.dataset.link) ? '1' : '';
      applyImage(el, img);
    } else {
      const cached = state.previews.get(el.dataset.link);
      if (cached) applyImage(el, cached);
      else if (cached === undefined) previewObserver.observe(el);
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering: building blocks

function avatarHtml(meta, link, { size = '', ring = true } = {}) {
  const host = hostOf(meta.site || link);
  const initials = (meta.kind === 'tag' ? '#' : (meta.name || '?').replace(/^[^A-Za-z0-9]+/, '').slice(0, 1)).toUpperCase();
  const fav = host && meta.kind !== 'tag' ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<span class="avatar ${size} ${ring ? '' : 'plain'}"><span style="--av-bg:${avatarBg(meta.id || meta.name)}">${initials}${fav}</span></span>`;
}

function profileHref(meta) {
  return meta.kind === 'tag' && meta.tag ? `#/tag/${encodeURIComponent(meta.tag)}` : `#/source/${encodeURIComponent(meta.id)}`;
}

function textCard(item, meta) {
  const topic = state.catalog.topics.find((t) => t.id === meta.topic);
  return `<div class="text-card" style="${gradientFor(meta.id || item.link)}">
    <span class="tc-mark">${topic ? topic.emoji : '📰'}</span>
    <span class="tc-src">${esc(item.via || meta.name)}</span>
    <span class="tc-title">${esc(item.title)}</span>
  </div>`;
}

function postHtml(item) {
  const meta = sourceMeta(item.sourceId, item);
  const topic = state.catalog.topics.find((t) => t.id === meta.topic);
  const link = safeUrl(item.link);
  const liked = state.liked.has(item.id);
  const saved = state.saved.has(item.id);
  const sub = [meta.kind === 'tag' && item.via ? `via ${item.via}` : topic?.name, item.author && item.author !== meta.name ? item.author : '']
    .filter(Boolean).map(esc).join('<span class="dot"></span>');
  const tags = (item.categories || []).filter((c) => c.length < 28).slice(0, 3);
  return `<article class="post" data-id="${esc(item.id)}">
    <header class="post-head">
      <a href="${profileHref(meta)}">${avatarHtml(meta, item.link)}</a>
      <div class="meta">
        <a class="post-src" href="${profileHref(meta)}">${esc(meta.name)}</a><span class="dot"></span><span class="muted">${timeAgo(item.published)}</span>
        ${sub ? `<span class="post-sub">${sub}</span>` : ''}
      </div>
      <button class="icon-btn" data-action="menu" aria-label="More options">${icon('more')}</button>
    </header>
    <div class="post-media" data-media data-link="${esc(link)}" data-img="${esc(safeUrl(item.image))}" data-action="media">
      ${textCard(item, meta)}
      ${icon('heart', 'big-heart')}
    </div>
    <div class="post-actions">
      <button data-action="like" class="${liked ? 'liked' : ''}" aria-pressed="${liked}" aria-label="Like">${icon('heart')}</button>
      <button data-action="share" aria-label="Share">${icon('send')}</button>
      <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open article">${icon('external')}</a>
      <span class="spacer"></span>
      <button data-action="save" class="${saved ? 'saved' : ''}" aria-pressed="${saved}" aria-label="Save">${icon('bookmark')}</button>
    </div>
    <div class="post-body">
      ${liked ? '<div class="post-likes">Liked by you</div>' : ''}
      <h3 class="post-title"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
      ${item.excerpt ? `<div class="post-caption clamp"><a class="post-src" href="${profileHref(meta)}">${esc(meta.name)}</a> ${esc(item.excerpt)}</div>
      <button class="more-btn" data-action="expand">more</button>` : ''}
      ${tags.length ? `<div class="post-tags">${tags.map((t) => `<a href="#/tag/${encodeURIComponent(t)}">#${esc(t.replace(/\s+/g, ''))}</a>`).join('')}</div>` : ''}
      <a class="read-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Read on ${esc(item.via || hostOf(link))} ${icon('external')}</a>
      <div class="post-time">${timeAgo(item.published, true)}</div>
    </div>
  </article>`;
}

function tileHtml(item) {
  const meta = sourceMeta(item.sourceId, item);
  return `<div class="tile" data-media data-link="${esc(safeUrl(item.link))}" data-img="${esc(safeUrl(item.image))}" data-action="open-post" data-id="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(item.title)}">
    ${textCard(item, meta)}
    <div class="overlay">${esc(item.title)}</div>
  </div>`;
}

function skeletonPosts(n = 2) {
  return Array.from({ length: n }, () => `<div class="post skeleton">
    <div class="post-head"><div class="sk" style="width:36px;height:36px;border-radius:50%"></div><div class="sk" style="width:140px;height:12px"></div></div>
    <div class="post-media sk" style="border-radius:0"></div>
    <div class="post-body"><div class="sk" style="height:14px;margin:14px 0 8px;width:90%"></div><div class="sk" style="height:12px;width:60%"></div></div>
  </div>`).join('');
}

const emptyState = (iconName, title, body, action = '') =>
  `<div class="empty"><div class="big">${icon(iconName)}</div><h2>${esc(title)}</h2><p>${body}</p>${action}</div>`;

// Itemised lookup for event handlers (posts can come from several lists).
const itemIndex = new Map();
function indexItems(items) { for (const it of items) itemIndex.set(it.id, it); }

// Incremental list rendering with an infinite-scroll sentinel.
let pager = null;
function renderPaged(container, items, render, pageSize = 10) {
  pager?.observer.disconnect();
  indexItems(items);
  let shown = 0;
  const sentinel = document.createElement('div');
  sentinel.className = 'sentinel';
  const more = () => {
    const chunk = items.slice(shown, shown + pageSize);
    shown += chunk.length;
    const tpl = document.createElement('template');
    tpl.innerHTML = chunk.map(render).join('');
    wireMedia(tpl.content);
    sentinel.before(tpl.content);
    if (shown >= items.length) pager.observer.disconnect();
  };
  container.append(sentinel);
  pager = { observer: new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: '1200px 0px' }) };
  more();
  if (shown < items.length) pager.observer.observe(sentinel);
}

// ---------------------------------------------------------------------------
// Views

const view = $('#view');
const rail = $('#rail');

function setNav(name) {
  for (const a of $$('[data-nav]')) a.classList.toggle('active', a.dataset.nav === name);
}

function storyGroups(items) {
  const groups = new Map();
  for (const it of items) {
    const key = topicOf(it.sourceId);
    const tagMeta = key === 'tags' ? sourceMeta(it.sourceId) : null;
    const gid = tagMeta ? tagMeta.id : key;
    if (!groups.has(gid)) {
      const topic = state.catalog.topics.find((t) => t.id === key);
      groups.set(gid, { id: gid, name: tagMeta ? tagMeta.name : topic?.name || 'More', emoji: topic?.emoji || '#', items: [] });
    }
    const g = groups.get(gid);
    if (g.items.length < 12) g.items.push(it);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    items: g.items.sort((a, b) => !!b.image - !!a.image || b.published - a.published),
    seen: g.items.every((it) => state.seen.has(it.id)),
  })).sort((a, b) => a.seen - b.seen);
}

let currentStories = [];
function storiesHtml(items) {
  currentStories = storyGroups(items.slice(0, 200));
  const circles = currentStories.map((g, i) => {
    const cover = g.items.find((it) => it.image)?.image;
    return `<button class="story ${g.seen ? 'seen' : ''}" data-action="story" data-index="${i}">
      <div class="story-ring"><div style="${esc(bgStyle(cover))}">${cover ? '' : esc(g.emoji)}</div></div>
      <span>${esc(g.name)}</span>
    </button>`;
  }).join('');
  return `<div class="stories" role="list">
    <a class="story add" href="#/following"><div class="story-ring"><div>+</div></div><span>Add feeds</span></a>
    ${circles}
  </div>`;
}

function homeChips() {
  const topics = new Set(state.timeline.items.map((it) => topicOf(it.sourceId)));
  if (topics.size < 2) return '';
  const chips = [{ id: 'all', name: 'All' }, ...state.catalog.topics.filter((t) => topics.has(t.id))];
  if (topics.has('tags')) chips.push({ id: 'tags', name: '# Hashtags' });
  if (topics.has('other')) chips.push({ id: 'other', name: 'Other' });
  return `<div class="chips">${chips.map((c) => `<button class="chip ${state.homeTopic === c.id ? 'active' : ''}" data-action="home-topic" data-topic="${c.id}">${c.emoji ? `${c.emoji} ` : ''}${esc(c.name)}</button>`).join('')}</div>`;
}

function renderHome() {
  setNav('home');
  view.className = 'view';
  rail.classList.add('hidden');
  const items = state.timeline.items.filter((it) => !state.hidden.has(it.id));
  if (!state.follows || !followedFeeds().length) {
    view.innerHTML = emptyState('plus', 'Your feed is empty', 'Follow a few news sources or hashtags to fill it up.', '<a class="btn" href="#/following">Find feeds to follow</a>');
    return;
  }
  if (!items.length) {
    view.innerHTML = state.loading
      ? `<div class="stories"></div>${skeletonPosts(3)}`
      : emptyState('refresh', 'Nothing here yet', 'Your feeds did not return any posts. Try refreshing or adding more sources.', '<button class="btn" data-action="refresh">Refresh</button>');
    return;
  }
  const filtered = state.homeTopic === 'all' ? items : items.filter((it) => topicOf(it.sourceId) === state.homeTopic);
  view.innerHTML = `${storiesHtml(items)}${homeChips()}<div id="feed"></div>`;
  const feed = $('#feed');
  renderPaged(feed, filtered, postHtml);
  renderRail();
}

function renderRail() {
  rail.classList.remove('hidden');
  const unfollowed = state.catalog.sources.filter((s) => !isFollowing(s.id));
  const picks = unfollowed.sort(() => Math.random() - 0.5).slice(0, 5);
  const tags = state.catalog.suggestedTags.filter((t) => !isFollowing(`tag:${t.toLowerCase()}`)).slice(0, 6);
  rail.innerHTML = `
    ${picks.length ? `<h3>Suggested for you <a href="#/following" class="post-src" style="color:var(--fg)">See all</a></h3>
    ${picks.map((s) => `<div class="row"><a href="#/source/${s.id}">${avatarHtml(s, s.site, { ring: false })}</a>
      <div class="meta"><b>${esc(s.name)}</b><small>${esc(state.catalog.topics.find((t) => t.id === s.topic)?.name || '')}</small></div>
      <button class="btn link small" data-action="follow" data-source="${s.id}">Follow</button></div>`).join('')}` : ''}
    ${tags.length ? `<h3 style="margin-top:22px">Trending hashtags</h3><div class="tag-cloud">${tags.map((t) => `<button class="chip" data-action="follow-tag" data-tag="${esc(t)}">#${esc(t.replace(/\s+/g, ''))}</button>`).join('')}</div>` : ''}
    <footer>Pulse · News from the sources you follow, as a photo feed.<br>Posts link to the original publisher.</footer>`;
}

let exploreQuery = '';
async function renderExplore(topicId = 'all') {
  setNav('explore');
  view.className = 'view wide';
  rail.classList.add('hidden');
  const topics = state.catalog.topics;
  view.innerHTML = `
    <div class="field" style="margin:14px 0 10px">${icon('search')}<input id="exploreSearch" type="search" placeholder="Search posts, or follow a #hashtag" value="${esc(exploreQuery)}" autocomplete="off"></div>
    <div class="chips">
      <a class="chip ${topicId === 'all' ? 'active' : ''}" href="#/explore">All</a>
      ${topics.map((t) => `<a class="chip ${topicId === t.id ? 'active' : ''}" href="#/explore/${t.id}">${t.emoji} ${esc(t.name)}</a>`).join('')}
    </div>
    <div id="searchFollow"></div>
    <div id="exploreEmpty"></div>
    <div class="grid" id="exploreGrid">${Array.from({ length: 12 }, () => '<div class="tile skeleton"><div class="sk" style="height:100%;border-radius:0"></div></div>').join('')}</div>`;
  const sources = state.catalog.sources.filter((s) => topicId === 'all' || s.topic === topicId);
  let items;
  try {
    items = await loadFeeds(sources.map((s) => ({ id: s.id, url: s.url })), `explore:${topicId}`, topicId === 'all' ? 8 : 20);
  } catch (err) {
    $('#exploreGrid').outerHTML = emptyState('refresh', 'Could not load Explore', esc(err.message));
    return;
  }
  if (location.hash.split('/')[1] !== 'explore') return; // navigated away meanwhile
  const draw = () => {
    const q = exploreQuery.trim().toLowerCase();
    const list = (q ? items.filter((it) => `${it.title} ${it.excerpt} ${it.categories?.join(' ')}`.toLowerCase().includes(q)) : items)
      .filter((it) => !state.hidden.has(it.id));
    const grid = $('#exploreGrid');
    grid.innerHTML = '';
    // Posts that already have a picture first, so the grid stays visual; newest first within each group.
    const sorted = [...list].sort((a, b) => !!b.image - !!a.image || b.published - a.published);
    $('#exploreEmpty').innerHTML = sorted.length || q ? '' : emptyState('search', 'No posts', 'Try another topic.');
    renderPaged(grid, sorted, tileHtml, 30);
    const tag = exploreQuery.replace(/^#/, '').trim();
    $('#searchFollow').innerHTML = tag
      ? `<div class="row card" style="margin-bottom:12px">${avatarHtml({ kind: 'tag', id: tag, name: tag }, '', { ring: false })}
          <div class="meta"><b>#${esc(tag.replace(/\s+/g, ''))}</b><small>${list.length} matching posts here · follow to get live news about “${esc(tag)}”</small></div>
          <a class="btn small secondary" href="#/tag/${encodeURIComponent(tag)}">View</a>
          <button class="btn small" data-action="follow-tag" data-tag="${esc(tag)}" ${isFollowing(`tag:${tag.toLowerCase()}`) ? 'disabled' : ''}>${isFollowing(`tag:${tag.toLowerCase()}`) ? 'Following' : 'Follow'}</button></div>`
      : '';
  };
  draw();
  let t;
  $('#exploreSearch').addEventListener('input', (e) => {
    exploreQuery = e.target.value;
    clearTimeout(t);
    t = setTimeout(draw, 180);
  });
}

async function renderProfile({ meta, feed, isTag }) {
  setNav('');
  view.className = 'view wide';
  rail.classList.add('hidden');
  const following = isFollowing(meta.id);
  const site = safeUrl(meta.site);
  const header = (count) => `<section class="profile">
      ${avatarHtml(meta, meta.site, { size: 'lg' })}
      <div>
        <h1>${esc(meta.name)}
          ${following
            ? `<button class="btn small secondary" data-action="unfollow" data-source="${esc(meta.id)}">Following</button>`
            : isTag
              ? `<button class="btn small" data-action="follow-tag" data-tag="${esc(meta.tag)}">Follow</button>`
              : `<button class="btn small" data-action="follow" data-source="${esc(meta.id)}">Follow</button>`}
        </h1>
        <div class="stats"><span><b>${count ?? '–'}</b> posts</span>${meta.topic && !isTag ? `<span>${esc(state.catalog.topics.find((t) => t.id === meta.topic)?.name || '')}</span>` : ''}</div>
        <div class="bio">${isTag ? `Live news about “${esc(meta.tag)}” from around the web.` : site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(site))}</a>` : ''}</div>
      </div>
    </section>
    <div class="tabs"><button class="active" data-action="profile-tab" data-tab="grid">${icon('grid')} Posts</button><button data-action="profile-tab" data-tab="feed">${icon('home')} Feed</button></div>`;
  view.innerHTML = header() + '<div class="grid" id="profileGrid"><div class="tile skeleton"><div class="sk" style="height:100%"></div></div></div>';
  let items;
  try {
    items = await loadFeeds([feed], `profile:${feed.url}`, 50);
  } catch (err) {
    view.innerHTML = header(0) + emptyState('refresh', 'Could not load this feed', esc(err.message));
    return;
  }
  if (location.hash !== currentRoute) return;
  view.innerHTML = header(items.length) + '<div id="profileBody" class="grid"></div>';
  renderPaged($('#profileBody'), items, tileHtml, 30);
  view._profileItems = items;
}

function renderSaved(tab = 'saved') {
  setNav('saved');
  view.className = 'view wide';
  rail.classList.add('hidden');
  const map = tab === 'liked' ? state.liked : state.saved;
  const items = [...map.values()].reverse();
  view.innerHTML = `<h1 class="page-title">${tab === 'liked' ? 'Liked posts' : 'Saved'}</h1>
    <div class="tabs"><a href="#/saved" class="${tab === 'saved' ? 'active' : ''}">${icon('bookmark')} Saved</a><a href="#/saved/liked" class="${tab === 'liked' ? 'active' : ''}">${icon('heart')} Liked</a></div>
    <div class="grid" id="savedGrid"></div>`;
  if (!items.length) {
    $('#savedGrid').outerHTML = emptyState(tab === 'liked' ? 'heart' : 'bookmark', tab === 'liked' ? 'No likes yet' : 'Save posts for later', tab === 'liked' ? 'Double-tap a post image to like it.' : 'Tap the bookmark on any post to keep it here.');
    return;
  }
  renderPaged($('#savedGrid'), items, tileHtml, 30);
}

function renderFollowing() {
  setNav('following');
  view.className = 'view';
  rail.classList.add('hidden');
  const { topics, sources, suggestedTags } = state.catalog;
  const custom = state.follows?.custom || [];
  view.innerHTML = `
    <h1 class="page-title">Follow feeds</h1>
    <div class="card">
      <form id="discoverForm" class="field" autocomplete="off">
        ${icon('search')}
        <input id="discoverInput" name="q" placeholder="Website, RSS URL, #hashtag or r/subreddit" aria-label="Feed to add">
        <button class="btn small" type="submit">Find</button>
      </form>
      <div class="input-kinds">
        <button data-action="example" data-q="theverge.com"><b>🌐 Any website</b><span class="muted">We find its RSS feed</span></button>
        <button data-action="example" data-q="#Nintendo Switch"><b># Hashtag</b><span class="muted">Live news search</span></button>
        <button data-action="example" data-q="r/MachineLearning"><b>👽 Subreddit</b><span class="muted">Top posts of the day</span></button>
        <button data-action="example" data-q="https://hnrss.org/newest?q=LLM"><b>${icon('rss')} RSS / Atom</b><span class="muted">Paste any feed URL</span></button>
        <button type="button" data-action="opml-import"><b>${icon('upload')} Import OPML</b><span class="muted">From another reader</span></button>
        <input type="file" accept=".opml,.xml,text/xml" id="opmlInput" hidden>
      </div>
      <div id="discoverResults" class="discover-results"></div>
    </div>

    <h2 class="section">Trending hashtags</h2>
    <div class="tag-cloud">${suggestedTags.map((t) => {
      const on = isFollowing(`tag:${t.toLowerCase()}`);
      return `<button class="chip ${on ? 'active' : ''}" data-action="${on ? 'unfollow' : 'follow-tag'}" data-tag="${esc(t)}" data-source="tag:${esc(t.toLowerCase())}">#${esc(t.replace(/\s+/g, ''))}</button>`;
    }).join('')}</div>

    ${custom.length ? `<h2 class="section">Your feeds & hashtags <button class="btn small secondary" data-action="opml-export">${icon('download')} Export OPML</button></h2>
      ${custom.map((c) => `<div class="row"><a href="${profileHref(c)}">${avatarHtml(c, c.site || c.url, { ring: false })}</a>
        <div class="meta"><b>${esc(c.name)}</b><small>${esc(c.kind === 'tag' ? 'Hashtag · live news search' : c.kind === 'reddit' ? 'Subreddit' : hostOf(c.site || c.url))}</small></div>
        <button class="btn small secondary" data-action="unfollow" data-source="${esc(c.id)}">Remove</button></div>`).join('')}` : ''}

    ${topics.map((t) => {
      const list = sources.filter((s) => s.topic === t.id);
      const all = list.every((s) => isFollowing(s.id));
      return `<h2 class="section"><span>${t.emoji} ${esc(t.name)}</span><button class="btn small ${all ? 'secondary' : ''}" data-action="${all ? 'unfollow-topic' : 'follow-topic'}" data-topic="${t.id}">${all ? 'Unfollow all' : 'Follow all'}</button></h2>
      ${list.map((s) => {
        const on = isFollowing(s.id);
        return `<div class="row"><a href="#/source/${s.id}">${avatarHtml(s, s.site, { ring: false })}</a>
          <div class="meta"><b>${esc(s.name)}</b><small>${esc(hostOf(s.site))}</small></div>
          <button class="btn small ${on ? 'secondary' : ''}" data-action="${on ? 'unfollow' : 'follow'}" data-source="${s.id}">${on ? 'Following' : 'Follow'}</button></div>`;
      }).join('')}`;
    }).join('')}`;

  $('#discoverForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runDiscover($('#discoverInput').value);
  });
  $('#opmlInput').addEventListener('change', (e) => importOpml(e.target.files[0]));
}

async function runDiscover(q) {
  const out = $('#discoverResults');
  if (!q.trim()) return;
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const { feeds } = await api(`/api/discover?q=${encodeURIComponent(q)}`);
    out.innerHTML = feeds.map((f, i) => {
      const meta = { id: f.url, name: f.name, kind: f.kind, site: f.site || f.url };
      return `<div class="card" style="padding:10px">
        <div class="row" style="padding:0">${avatarHtml(meta, f.site, { ring: false })}
          <div class="meta"><b>${esc(f.name)}</b><small>${esc(f.kind === 'tag' ? 'Live news search for this hashtag' : hostOf(f.site || f.url))}</small></div>
          <button class="btn small" data-action="follow-found" data-index="${i}">Follow</button></div>
        ${f.sample?.length ? `<div class="sample-thumbs">${f.sample.map((s) => `<div style="${esc(bgStyle(s.image))}">${s.image ? '' : esc(s.title.slice(0, 60))}</div>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    out._feeds = feeds;
  } catch (err) {
    out.innerHTML = `<p class="hint">⚠️ ${esc(err.message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// OPML import / export

async function importOpml(file) {
  if (!file) return;
  const doc = new DOMParser().parseFromString(await file.text(), 'text/xml');
  const outlines = $$('outline[xmlUrl], outline[xmlurl]', doc);
  let added = 0;
  let skipped = 0;
  for (const o of outlines) {
    const url = o.getAttribute('xmlUrl') || o.getAttribute('xmlurl');
    if (!safeUrl(url) || /youtube\.com|youtu\.be|twitch\.tv/i.test(url)) { skipped++; continue; }
    const before = followedFeeds().length;
    followCustom({ url, name: o.getAttribute('title') || o.getAttribute('text') || hostOf(url), site: o.getAttribute('htmlUrl') || '', kind: 'rss' });
    if (followedFeeds().length > before) added++;
  }
  toast(`Imported ${added} feed${added === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} video/invalid` : ''}`);
  state.timeline.at = 0;
  renderFollowing();
}

function exportOpml() {
  const feeds = [...followedFeeds()].map((f) => ({ ...f, meta: sourceMeta(f.id) }));
  const x = (s) => esc(s);
  const body = feeds.map((f) => `    <outline type="rss" text="${x(f.meta.name)}" title="${x(f.meta.name)}" xmlUrl="${x(f.url)}" htmlUrl="${x(f.meta.site || '')}"/>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Pulse subscriptions</title></head>\n  <body>\n${body}\n  </body>\n</opml>\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'text/x-opml' }));
  a.download = 'pulse-subscriptions.opml';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Modals: post, menu, onboarding, stories

function openModal(html, { onClose, cls = '' } = {}) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = `modal ${cls}`;
  wrap.innerHTML = `<button class="modal-close" data-close aria-label="Close">${icon('close')}</button><div class="modal-box" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (!root.children.length) document.body.style.overflow = '';
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  root.append(wrap);
  document.body.style.overflow = 'hidden';
  wireMedia(wrap);
  return { el: wrap, close };
}

function openPost(item) {
  indexItems([item]);
  openModal(postHtml(item));
}

function openMenu(item) {
  const meta = sourceMeta(item.sourceId, item);
  const m = openModal(`<div class="menu-list">
    ${isFollowing(meta.id) ? `<button class="danger" data-m="unfollow">Unfollow ${esc(meta.name)}</button>` : ''}
    <button class="danger" data-m="hide">Hide this post</button>
    <a href="${esc(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">Open article</a>
    <a href="${profileHref(meta)}" data-m="close">Go to ${esc(meta.name)}</a>
    <button data-m="copy">Copy link</button>
    <button data-m="close">Cancel</button>
  </div>`);
  m.el.addEventListener('click', (e) => {
    const action = e.target.closest('[data-m]')?.dataset.m;
    if (!action) return;
    if (action === 'unfollow') { unfollow(meta.id); toast(`Unfollowed ${meta.name}`); route(); }
    if (action === 'hide') {
      state.hidden.add(item.id);
      store.set('hidden', [...state.hidden].slice(-1000));
      $$(`.post[data-id="${CSS.escape(item.id)}"]`).forEach((el) => el.remove());
      toast('Post hidden');
    }
    if (action === 'copy') copyLink(item);
    m.close();
  });
}

function onboarding() {
  const picked = new Set(['tech', 'ai', 'gaming']);
  const m = openModal(`<div class="sheet">
    <h2>Welcome to Pulse 👋</h2>
    <p class="muted">Pick what you're into. We'll follow the best sources for each — you can fine-tune later.</p>
    <div class="topic-pick">${state.catalog.topics.map((t) => `<button data-topic="${t.id}" class="${picked.has(t.id) ? 'on' : ''}"><span class="e">${t.emoji}</span>${esc(t.name)}</button>`).join('')}</div>
    <button class="btn" style="width:100%;height:44px" data-go>Start reading</button>
  </div>`, {
    onClose: () => {
      if (!state.follows) {
        state.follows = { sources: state.catalog.sources.filter((s) => picked.has(s.topic)).map((s) => s.id), custom: [] };
        persistFollows();
        refreshHome();
      }
    },
  });
  $('.modal-close', m.el).remove();
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (b) {
      picked.has(b.dataset.topic) ? picked.delete(b.dataset.topic) : picked.add(b.dataset.topic);
      b.classList.toggle('on');
    }
    if (e.target.closest('[data-go]')) m.close();
  });
}

function openStories(groupIndex) {
  let g = groupIndex;
  let i = 0;
  let raf = 0;
  let start = 0;
  let elapsed = 0;
  let paused = false;
  const DURATION = 6000;
  const el = document.createElement('div');
  el.className = 'story-viewer';
  el.setAttribute('role', 'dialog');
  document.body.append(el);
  document.body.style.overflow = 'hidden';

  const close = () => {
    cancelAnimationFrame(raf);
    el.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    store.set('seen', [...state.seen].slice(-2000));
    if (currentRoute === '' || currentRoute === '#/') {
      const s = $('.stories');
      if (s) s.outerHTML = storiesHtml(state.timeline.items.filter((it) => !state.hidden.has(it.id)));
    }
  };
  const go = (dir) => {
    const group = currentStories[g];
    i += dir;
    if (i < 0) { if (g > 0) { g--; i = currentStories[g].items.length - 1; } else i = 0; }
    if (i >= group.items.length) { g++; i = 0; if (g >= currentStories.length) return close(); }
    draw();
  };
  const tick = (t) => {
    if (!paused) {
      const p = Math.min(1, (elapsed + t - start) / DURATION);
      const bar = $('.sv-bars div:nth-child(' + (i + 1) + ') i', el);
      if (bar) bar.style.width = `${p * 100}%`;
      if (p >= 1) return go(1);
    }
    raf = requestAnimationFrame(tick);
  };
  const draw = () => {
    cancelAnimationFrame(raf);
    const group = currentStories[g];
    const item = group.items[i];
    state.seen.add(item.id);
    const meta = sourceMeta(item.sourceId, item);
    const img = safeUrl(item.image) || state.previews.get(item.link);
    el.innerHTML = `<div class="sv-frame">
      <div class="sv-bg ${img ? '' : 'text'}" style="${img ? esc(bgStyle(img)) : gradientFor(meta.id)}"></div>
      <div class="sv-shade"></div>
      <div class="sv-bars">${group.items.map((_, k) => `<div><i style="width:${k < i ? 100 : 0}%"></i></div>`).join('')}</div>
      <div class="sv-head">${avatarHtml(meta, item.link)}<div>${esc(group.name)} <small>· ${esc(item.via || meta.name)} · ${timeAgo(item.published)}</small></div><button data-sv="close" aria-label="Close">${icon('close')}</button></div>
      <button class="sv-tap prev" data-sv="prev" aria-label="Previous"></button>
      <button class="sv-tap next" data-sv="next" aria-label="Next"></button>
      <div class="sv-body"><h2>${esc(item.title)}</h2>${item.excerpt ? `<p>${esc(item.excerpt)}</p>` : ''}
        <a class="btn" href="${esc(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">Read article ${icon('external')}</a></div>
    </div>`;
    elapsed = 0;
    start = performance.now();
    raf = requestAnimationFrame(tick);
    if (!img) getPreview(item.link).then((p) => {
      if (p.image && currentStories[g]?.items[i] === item) {
        const bg = $('.sv-bg', el);
        bg.classList.remove('text');
        bg.setAttribute('style', bgStyle(p.image));
      }
    });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-sv]')?.dataset.sv;
    if (a === 'close') close();
    else if (a === 'prev') go(-1);
    else if (a === 'next') go(1);
    else if (e.target === el) close();
  });
  // Hold to pause, swipe down to close.
  let downY = null;
  el.addEventListener('pointerdown', (e) => { downY = e.clientY; paused = true; elapsed += performance.now() - start; });
  el.addEventListener('pointerup', (e) => {
    paused = false;
    start = performance.now();
    if (downY != null && e.clientY - downY > 90) close();
    downY = null;
  });
  document.addEventListener('keydown', onKey);
  draw();
}

// ---------------------------------------------------------------------------
// Actions

function setLiked(item, on) {
  if (on) state.liked.set(item.id, item); else state.liked.delete(item.id);
  persistMapCapped('liked', state.liked);
  for (const post of $$(`.post[data-id="${CSS.escape(item.id)}"]`)) {
    const b = $('[data-action="like"]', post);
    b.classList.toggle('liked', on);
    b.setAttribute('aria-pressed', on);
    const likes = $('.post-likes', post);
    if (on && !likes) $('.post-body', post).insertAdjacentHTML('afterbegin', '<div class="post-likes">Liked by you</div>');
    if (!on) likes?.remove();
  }
}

function toggleSaved(item) {
  const on = !state.saved.has(item.id);
  if (on) state.saved.set(item.id, item); else state.saved.delete(item.id);
  persistMapCapped('saved', state.saved, 1000);
  for (const b of $$(`.post[data-id="${CSS.escape(item.id)}"] [data-action="save"]`)) {
    b.classList.toggle('saved', on);
    b.setAttribute('aria-pressed', on);
  }
  toast(on ? 'Saved' : 'Removed from saved');
}

async function copyLink(item) {
  try {
    await navigator.clipboard.writeText(item.link);
    toast('Link copied');
  } catch {
    toast(item.link);
  }
}

async function share(item) {
  if (navigator.share) {
    try { await navigator.share({ title: item.title, url: item.link }); } catch { /* cancelled */ }
  } else copyLink(item);
}

async function followTag(tag) {
  try {
    const { feeds } = await api(`/api/discover?q=${encodeURIComponent(`#${tag}`)}`);
    followCustom(feeds[0]);
    toast(`Following ${feeds[0].name}`);
    state.timeline.at = 0;
  } catch (err) {
    toast(err.message);
  }
}

function itemFromEvent(target) {
  const id = target.closest('[data-id]')?.dataset.id;
  return id ? itemIndex.get(id) : null;
}

let lastTap = 0;
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const item = itemFromEvent(el);

  switch (action) {
    case 'like': return item && setLiked(item, !state.liked.has(item.id));
    case 'save': return item && toggleSaved(item);
    case 'share': return item && share(item);
    case 'menu': return item && openMenu(item);
    case 'expand': {
      el.previousElementSibling?.classList.remove('clamp');
      return el.remove();
    }
    case 'media': {
      // Double-tap / double-click to like, just like a photo feed.
      const now = Date.now();
      if (now - lastTap < 320 && item) {
        setLiked(item, true);
        const heart = $('.big-heart', el);
        heart.classList.remove('pop');
        void heart.getBoundingClientRect();
        heart.classList.add('pop');
        lastTap = 0;
      } else lastTap = now;
      return;
    }
    case 'open-post': return item && openPost(item);
    case 'story': return openStories(Number(el.dataset.index));
    case 'home-topic':
      state.homeTopic = el.dataset.topic;
      window.scrollTo({ top: 0 });
      return renderHome();
    case 'refresh': return refreshHome();
    case 'follow': {
      follow(el.dataset.source);
      el.textContent = 'Following';
      el.dataset.action = 'unfollow';
      el.classList.add('secondary');
      state.timeline.at = 0;
      if (currentRoute === '#/' || currentRoute === '') refreshHome();
      return toast(`Following ${sourceMeta(el.dataset.source).name}`);
    }
    case 'unfollow': {
      const name = sourceMeta(el.dataset.source).name;
      unfollow(el.dataset.source);
      toast(`Unfollowed ${name}`);
      return route();
    }
    case 'follow-topic':
    case 'unfollow-topic': {
      for (const s of state.catalog.sources.filter((x) => x.topic === el.dataset.topic)) {
        action === 'follow-topic' ? follow(s.id) : unfollow(s.id);
      }
      state.timeline.at = 0;
      return renderFollowing();
    }
    case 'follow-tag': {
      el.disabled = true;
      await followTag(el.dataset.tag);
      return route();
    }
    case 'follow-found': {
      const feeds = $('#discoverResults')._feeds || [];
      const f = feeds[Number(el.dataset.index)];
      if (!f) return;
      followCustom(f);
      state.timeline.at = 0;
      toast(`Following ${f.name}`);
      return renderFollowing();
    }
    case 'example': {
      const input = $('#discoverInput');
      input.value = el.dataset.q;
      input.focus();
      return runDiscover(el.dataset.q);
    }
    case 'opml-import': return $('#opmlInput').click();
    case 'opml-export': return exportOpml();
    case 'profile-tab': {
      const items = view._profileItems || [];
      for (const b of $$('.tabs button', view)) b.classList.toggle('active', b === el);
      const body = $('#profileBody');
      body.innerHTML = '';
      body.className = el.dataset.tab === 'grid' ? 'grid' : '';
      body.style.maxWidth = el.dataset.tab === 'grid' ? '' : 'var(--feed-w)';
      body.style.margin = el.dataset.tab === 'grid' ? '' : '20px auto 0';
      return renderPaged(body, items, el.dataset.tab === 'grid' ? tileHtml : postHtml, el.dataset.tab === 'grid' ? 30 : 10);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.tile[data-action="open-post"]')) e.target.click();
});

// ---------------------------------------------------------------------------
// New-posts pill & background refresh

const pill = document.createElement('button');
pill.className = 'new-pill';
document.body.append(pill);
function showNewPill(n) {
  if (!(currentRoute === '' || currentRoute === '#/')) return;
  pill.innerHTML = `${icon('up')} ${n} new post${n === 1 ? '' : 's'}`;
  pill.classList.add('show');
}
pill.addEventListener('click', () => {
  pill.classList.remove('show');
  if (state.fresh) state.timeline = { items: state.fresh, at: Date.now() };
  state.fresh = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderHome();
});

async function refreshHome() {
  const hadItems = state.timeline.items.length > 0;
  if (!hadItems) { state.loading = true; renderHome(); }
  try {
    await loadTimeline({ background: hadItems });
  } catch (err) {
    toast(`Couldn't refresh: ${err.message}`);
  }
  if (!hadItems && (currentRoute === '' || currentRoute === '#/')) renderHome();
}

setInterval(() => {
  if (document.visibilityState === 'visible' && state.follows) loadTimeline({ background: true }).catch(() => {});
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Router

let currentRoute = null;
async function route() {
  const hash = location.hash || '#/';
  const changed = hash !== currentRoute;
  currentRoute = hash;
  const [, page = '', arg = ''] = hash.split('/');
  if (changed) window.scrollTo({ top: 0 });
  pill.classList.remove('show');

  if (page === '') {
    // Refetch when the follow list changed or the cache is older than 5 minutes.
    const stale = Date.now() - state.timeline.at > 5 * 60 * 1000;
    if (!(stale && state.follows)) return renderHome();
    // Show cached posts instantly; new ones arrive behind a "new posts" pill.
    const hadItems = state.timeline.items.length > 0;
    if (!hadItems) state.loading = true;
    renderHome();
    try {
      await loadTimeline({ background: hadItems });
    } catch (err) {
      state.loading = false;
      toast(`Couldn't load feed: ${err.message}`);
    }
    if (currentRoute === hash && !hadItems) renderHome();
    return;
  }
  if (page === 'explore') return renderExplore(arg || 'all');
  if (page === 'following') return renderFollowing();
  if (page === 'saved') return renderSaved(arg === 'liked' ? 'liked' : 'saved');
  if (page === 'source') {
    const id = decodeURIComponent(arg);
    const meta = allSources().get(id);
    if (!meta) { view.innerHTML = emptyState('search', 'Source not found', 'It may have been removed.'); return; }
    return renderProfile({ meta, feed: { id, url: meta.url } });
  }
  if (page === 'tag') {
    const tag = decodeURIComponent(arg);
    const id = `tag:${tag.toLowerCase()}`;
    const existing = allSources().get(id);
    let url = existing?.url;
    if (!url) {
      try { url = (await api(`/api/discover?q=${encodeURIComponent(`#${tag}`)}`)).feeds[0].url; } catch (err) { toast(err.message); return; }
    }
    return renderProfile({ meta: existing || { id, name: `#${tag.replace(/\s+/g, '')}`, kind: 'tag', tag, topic: 'tags' }, feed: { id, url }, isTag: true });
  }
  location.hash = '#/';
}

// ---------------------------------------------------------------------------
// Theme

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(store.get('theme', ''));
$('#themeToggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
});

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  hydrateIcons();
  try {
    state.catalog = await api('/api/catalog');
  } catch (err) {
    view.innerHTML = emptyState('refresh', 'Pulse is offline', esc(err.message));
    return;
  }
  for (const s of state.catalog.sources) sourceById.set(s.id, s);
  // Drop cached posts from sources that are no longer followed.
  const ids = new Set(followedFeeds().map((f) => f.id));
  state.timeline.items = state.timeline.items.filter((it) => ids.has(it.sourceId));
  window.addEventListener('hashchange', route);
  route();
  if (!state.follows) onboarding();
}

boot();
