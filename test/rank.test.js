import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diversify, isSpam } from '../server/rank.js';

const post = (title, extra = {}) => ({ title, excerpt: '', link: 'https://news.example.com/2026/11/story', categories: [], ...extra });

test('spam filter drops ads, deals and promo codes', () => {
  for (const t of [
    'Use promo code SAVE20 for 20% off NordVPN',
    'The best Black Friday deals on laptops',
    'AirPods Pro hit their lowest price ever',
    'Save $200 on the Galaxy S26 today',
    'Sponsored: How Acme Cloud scales your startup',
    'Get 40% off Xbox Game Pass Ultimate',
    'Steam Deck is $100 off for a limited time',
    'Win a PS5 in our holiday giveaway',
  ]) assert.ok(isSpam(post(t)), t);
  assert.ok(isSpam(post('Great headset', { categories: ['Deals'] })), 'deal category');
  assert.ok(isSpam(post('Great headset', { link: 'https://site.com/deals/headset' })), 'deals path');
  assert.ok(isSpam(post('Great headset', { excerpt: 'Enter coupon code TECH at checkout.' })), 'coupon in excerpt');
});

test('spam filter keeps real news', () => {
  for (const t of [
    'OpenAI releases a new reasoning model',
    'Retailers report record Black Friday online spending',
    'FTC sues company over deceptive pricing',
    'Nintendo announces the next Zelda',
    'SpaceX Starship completes orbital refuelling test',
    'Microsoft closes the Activision deal review',
  ]) assert.ok(!isSpam(post(t)), t);
  assert.ok(!isSpam(post('Chip prices fall', { excerpt: 'Analysts say discounts on GPUs may continue into next year.' })));
});

test('diversify spreads a prolific source across the timeline', () => {
  const now = Date.now();
  const items = [];
  // Source "spam" posted 20 stories in the last 20 minutes; three others posted one each over a few hours.
  for (let i = 0; i < 20; i++) items.push({ id: `s${i}`, sourceId: 'spam', published: now - i * 60_000 });
  items.push({ id: 'a', sourceId: 'a', published: now - 2 * 3600_000 });
  items.push({ id: 'b', sourceId: 'b', published: now - 3 * 3600_000 });
  items.push({ id: 'c', sourceId: 'c', published: now - 5 * 3600_000 });
  const out = diversify(items);
  assert.equal(out.length, items.length, 'nothing dropped');
  const firstSix = out.slice(0, 6).map((it) => it.sourceId);
  for (const s of ['a', 'b', 'c']) assert.ok(firstSix.includes(s), `${s} in the first six: ${firstSix}`);
});

test('diversify never shows the same source twice in a row when others are available', () => {
  const now = Date.now();
  const items = [];
  for (const [src, n] of [['x', 10], ['y', 10], ['z', 10]]) for (let i = 0; i < n; i++) items.push({ id: src + i, sourceId: src, published: now - i * 600_000 - src.charCodeAt(0) });
  const out = diversify(items);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].sourceId, out[i - 1].sourceId, `position ${i}`);
});
