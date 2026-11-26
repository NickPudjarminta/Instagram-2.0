import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dns from 'node:dns/promises';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const realFetch = globalThis.fetch;
let server;
let base;

before(async () => {
  // Pretend every upstream host is public and serve fixtures instead of the network.
  dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith(base)) return realFetch(url, opts);
    if (u === 'https://feeds.test/rss') return new Response(fixture('rss.xml'));
    if (u === 'https://feeds.test/atom') return new Response(fixture('atom.xml'));
    if (u === 'https://site.test/') return new Response('<link rel="alternate" type="application/rss+xml" href="/rss">');
    if (u === 'https://site.test/rss') return new Response(null, { status: 301, headers: { location: 'https://feeds.test/rss' } });
    if (u === 'https://tech.example.com/inline') return new Response('<meta property="og:image" content="https://img.test/og.jpg">');
    return new Response('nope', { status: 404 });
  };
  const { createServer } = await import('../server/index.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });

const post = (path, body) => realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('serves the app shell and catalog without video sources', async () => {
  const html = await (await realFetch(`${base}/`)).text();
  assert.match(html, /<title>Pulse/);
  const cat = await (await realFetch(`${base}/api/catalog`)).json();
  assert.ok(cat.sources.length > 20);
  assert.ok(cat.sources.every((s) => !/youtube|twitch/.test(s.url)));
  assert.ok(cat.topics.some((t) => t.id === 'ai') && cat.topics.some((t) => t.id === 'gaming'));
});

test('aggregates feeds newest-first and reports failures', async () => {
  const res = await post('/api/feed', { feeds: [{ id: 'a', url: 'https://feeds.test/rss' }, { id: 'b', url: 'https://feeds.test/atom' }, { id: 'c', url: 'https://feeds.test/missing' }] });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.items.length, 4);
  assert.deepEqual(data.items.map((i) => i.sourceId), ['b', 'a', 'a', 'a']);
  const times = data.items.map((i) => i.published);
  assert.deepEqual(times, [...times].sort((x, y) => y - x));
  assert.deepEqual(data.errors.map((e) => e.id), ['c']);
});

test('discovers feeds from a website, hashtags and rejects YouTube', async () => {
  const site = await (await realFetch(`${base}/api/discover?q=site.test`)).json();
  assert.equal(site.feeds[0].name, 'Example Tech');
  const tag = await (await realFetch(`${base}/api/discover?q=${encodeURIComponent('#OpenAI')}`)).json();
  assert.equal(tag.feeds[0].kind, 'tag');
  assert.match(tag.feeds[0].url, /bing\.com\/news\/search\?q=OpenAI&format=rss/);
  const yt = await realFetch(`${base}/api/discover?q=https://www.youtube.com/@channel`);
  assert.equal(yt.status, 400);
});

test('previews return og:image', async () => {
  const p = await (await realFetch(`${base}/api/preview?url=${encodeURIComponent('https://tech.example.com/inline')}`)).json();
  assert.equal(p.image, 'https://img.test/og.jpg');
});
