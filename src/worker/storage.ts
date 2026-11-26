import type { ArticleCacheEntry, Env, Feed, FeedsConfig, FeedCacheEntry } from "./types";
import { SEED_FEEDS } from "./seed";

const FEEDS_CONFIG_KEY = "feeds-config";
const FEED_CACHE_PREFIX = "feed-cache:";
const ARTICLE_CACHE_PREFIX = "article-cache:";

/** Cheap, deterministic, dependency-free hash (djb2) for building cache keys from URLs. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export async function getFeedsConfig(env: Env): Promise<FeedsConfig> {
  const raw = await env.RSS_KV.get(FEEDS_CONFIG_KEY, "json");
  if (raw && typeof raw === "object" && Array.isArray((raw as FeedsConfig).feeds)) {
    return raw as FeedsConfig;
  }

  // First run: bootstrap with the seed feeds.
  const seeded: FeedsConfig = { feeds: SEED_FEEDS };
  await saveFeedsConfig(env, seeded);
  return seeded;
}

export async function saveFeedsConfig(env: Env, config: FeedsConfig): Promise<void> {
  await env.RSS_KV.put(FEEDS_CONFIG_KEY, JSON.stringify(config));
}

export async function getFeed(env: Env, feedId: string): Promise<Feed | undefined> {
  const config = await getFeedsConfig(env);
  return config.feeds.find((f) => f.id === feedId);
}

export function feedCacheKey(feedId: string): string {
  return `${FEED_CACHE_PREFIX}${feedId}`;
}

export async function getFeedCache(env: Env, feedId: string): Promise<FeedCacheEntry | null> {
  const raw = await env.RSS_KV.get(feedCacheKey(feedId), "json");
  if (raw && typeof raw === "object") {
    return raw as FeedCacheEntry;
  }
  return null;
}

export async function setFeedCache(env: Env, feedId: string, entry: FeedCacheEntry): Promise<void> {
  // No TTL - this is only ever overwritten by an explicit refresh.
  await env.RSS_KV.put(feedCacheKey(feedId), JSON.stringify(entry));
}

export async function deleteFeedCache(env: Env, feedId: string): Promise<void> {
  await env.RSS_KV.delete(feedCacheKey(feedId));
}

export function generateFeedId(): string {
  return crypto.randomUUID();
}

function articleCacheKey(link: string): string {
  return `${ARTICLE_CACHE_PREFIX}${hashString(link)}`;
}

export async function getArticleCache(env: Env, link: string): Promise<ArticleCacheEntry | null> {
  const raw = await env.RSS_KV.get(articleCacheKey(link), "json");
  if (raw && typeof raw === "object") {
    return raw as ArticleCacheEntry;
  }
  return null;
}

export async function setArticleCache(env: Env, link: string, entry: ArticleCacheEntry): Promise<void> {
  // No TTL - published articles don't change, so once extracted it's cached for good.
  await env.RSS_KV.put(articleCacheKey(link), JSON.stringify(entry));
}
