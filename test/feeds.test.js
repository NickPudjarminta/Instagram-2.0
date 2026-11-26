import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, stripHtml } from '../server/feeds.js';
import { findFeedLinks, extractPreview, normalizeTag, tagFeedUrl } from '../server/discover.js';
import { parsePublicUrl, isVideoUrl } from '../server/net.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses RSS with media, inline images, enclosures; drops YouTube items', () => {
  const feed = parseFeed(fixture('rss.xml'), 'https://tech.example.com/feed');
  assert.equal(feed.title, 'Example Tech');
  assert.equal(feed.items.length, 3);
  const [gpu, inline, enc] = feed.items;
  assert.equal(gpu.title, 'New GPU & you: what changes');
  assert.equal(gpu.image, 'https://cdn.example.com/big.jpg', 'largest media:content wins');
  assert.equal(gpu.excerpt, 'The new card is fast.', 'boilerplate removed');
  assert.equal(gpu.author, 'Ada Lovelace');
  assert.deepEqual(gpu.categories, ['Hardware']);
  assert.ok(gpu.published > 0);
  assert.equal(inline.image, 'https://tech.example.com/images/photo.png', 'skips tracking pixel, resolves relative');
  assert.equal(enc.link, 'https://tech.example.com/enc');
  assert.equal(enc.image, 'https://cdn.example.com/enc.jpg', 'upgraded to https');
  assert.ok(feed.items.every((i) => !i.link.includes('youtube')));
});

test('parses Atom (Reddit style) with thumbnails and escaped HTML content', () => {
  const feed = parseFeed(fixture('atom.xml'), 'https://www.reddit.com/r/gaming/.rss');
  assert.equal(feed.items.length, 1);
  const [it] = feed.items;
  assert.equal(it.link, 'https://www.reddit.com/r/gaming/comments/1/cool/');
  assert.equal(it.image, 'https://b.thumbs.redditmedia.com/x.jpg');
  assert.equal(it.excerpt, 'Look at this');
  assert.equal(it.author, '/u/player');
});

test('parses Bing News hashtag feeds: unwraps links, keeps publisher and thumbnail', () => {
  const [it] = parseFeed(fixture('bing.xml'), tagFeedUrl('nintendo')).items;
  assert.equal(it.link, 'https://www.polygon.com/nintendo-thing');
  assert.equal(it.via, 'Polygon');
  assert.match(it.image, /^https:\/\/www\.bing\.com\/th\?id=OVFT\.abc&pid=News&w=1080/);
});

test('rejects non-feeds', () => {
  assert.throws(() => parseFeed('<html><body>hi</body></html>'), /Not an RSS or Atom feed/);
});

test('stripHtml decodes entities and drops tags', () => {
  assert.equal(stripHtml('<p>A &amp; B&#8217;s <script>x()</script>test&nbsp;</p>'), 'A & B’s test');
});

test('finds feed links in HTML, skipping comment feeds', () => {
  const html = `<head>
    <link rel="alternate" type="application/rss+xml" title="Main" href="/feed/">
    <link rel="alternate" type="application/rss+xml" href="/comments/feed/">
    <link rel="stylesheet" href="/a.css">
    <link rel='alternate' type='application/atom+xml' href='https://x.example/atom.xml'>
  </head>`;
  assert.deepEqual(findFeedLinks(html, 'https://x.example/blog'), [
    { url: 'https://x.example/feed/', title: 'Main' },
    { url: 'https://x.example/atom.xml', title: '' },
  ]);
});

test('extracts og:image previews', () => {
  const html = '<meta name="description" content="Desc"><meta property="og:image" content="//img.example/p.jpg">';
  assert.deepEqual(extractPreview(html, 'https://news.example/a'), { image: 'https://img.example/p.jpg', description: 'Desc' });
  assert.equal(extractPreview('<p>none</p>', 'https://x').image, '');
});

test('URL safety: blocks private hosts, non-http and video platforms', () => {
  assert.throws(() => parsePublicUrl('file:///etc/passwd'), /Only http/);
  assert.throws(() => parsePublicUrl('http://localhost:3000'), /Private/);
  assert.throws(() => parsePublicUrl('https://www.youtube.com/feeds/videos.xml?channel_id=1'), /Video/);
  assert.equal(parsePublicUrl('https://example.com/feed').hostname, 'example.com');
  assert.ok(isVideoUrl('https://youtu.be/x'));
  assert.equal(normalizeTag('#  Quantum   computing '), 'Quantum computing');
});
