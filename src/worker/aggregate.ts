import type { Env, Feed, FeedFailure, FeedItem } from "./types";
import { getFeedsConfig, getFeedCache, setFeedCache, saveFeedsConfig } from "./storage";
import { fetchAndParseFeed } from "./feedFetch";

function matchesTags(feed: Feed, tags: string[]): boolean {
  if (tags.length === 0) return true;
  return feed.tags.some((t) => tags.includes(t));
}

export interface AggregatedItems {
  items: FeedItem[];
  lastUpdated: string | null;
  totalFeeds: number;
  cachedFeeds: number;
}

/** Read-only: merges each matching feed's last-cached items. No network calls. */
export async function aggregateItems(env: Env, tags: string[]): Promise<AggregatedItems> {
  const config = await getFeedsConfig(env);
  const matching = config.feeds.filter((f) => matchesTags(f, tags));

  const caches = await Promise.all(matching.map((f) => getFeedCache(env, f.id)));

  const items: FeedItem[] = [];
  let lastUpdated: string | null = null;
  let cachedFeeds = 0;

  for (const cache of caches) {
    if (!cache) continue;
    cachedFeeds++;
    items.push(...cache.items);
    if (!lastUpdated || cache.fetchedAt > lastUpdated) {
      lastUpdated = cache.fetchedAt;
    }
  }

  items.sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });

  return {
    items: items.slice(0, 150),
    lastUpdated,
    totalFeeds: matching.length,
    cachedFeeds,
  };
}

export interface RefreshResult {
  feedFailures: FeedFailure[];
  refreshedFeedIds: string[];
  lastUpdated: string;
}

/** Fetches + parses the target feeds (scoped by tags, or all if omitted/empty) and overwrites their cache. */
export async function refreshFeeds(env: Env, tags: string[]): Promise<RefreshResult> {
  const config = await getFeedsConfig(env);
  const targets = config.feeds.filter((f) => matchesTags(f, tags));

  const now = new Date().toISOString();
  const feedFailures: FeedFailure[] = [];
  const refreshedFeedIds: string[] = [];
  let configChanged = false;

  await Promise.all(
    targets.map(async (feed) => {
      try {
        const result = await fetchAndParseFeed(feed);
        await setFeedCache(env, feed.id, { fetchedAt: now, items: result.items });
        refreshedFeedIds.push(feed.id);

        if (result.resolvedUrl && result.resolvedUrl !== feed.url) {
          feed.url = result.resolvedUrl;
          configChanged = true;
        }
        if (result.title && result.title !== feed.name && !feed.name) {
          feed.name = result.title;
          configChanged = true;
        }
      } catch (err) {
        feedFailures.push({
          feedId: feed.id,
          feedName: feed.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  if (configChanged) {
    await saveFeedsConfig(env, config);
  }

  return { feedFailures, refreshedFeedIds, lastUpdated: now };
}
