import { parseFeedXml, type ParsedFeed } from "./feedParser";
import { looksLikeYoutubePage, resolveFeedUrl, toLongFormFeedUrl } from "./youtubeResolve";
import type { Feed } from "./types";

const FEED_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 RSSReader/1.0",
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

export interface FetchResult extends ParsedFeed {
  /** The canonical feed URL actually fetched, if it differs from the feed's stored URL (e.g. a resolved YouTube handle). */
  resolvedUrl?: string;
}

/**
 * Resolves (if needed), fetches, and parses a single feed.
 * Throws with a human-readable message on any failure.
 */
export async function fetchAndParseFeed(feed: Pick<Feed, "id" | "name" | "url">): Promise<FetchResult> {
  let feedUrl = feed.url;
  let resolvedUrl: string | undefined;

  if (looksLikeYoutubePage(feed.url)) {
    feedUrl = await resolveFeedUrl(feed.url);
    if (feedUrl !== feed.url) resolvedUrl = feedUrl;
  }

  // For YouTube channel feeds, always prefer the long-form-only playlist feed
  // (excludes Shorts/live streams). `resolvedUrl` - what gets persisted back
  // to the stored feed config - deliberately stays the plain channel_id URL;
  // only the actual network fetch is redirected.
  const longFormUrl = toLongFormFeedUrl(feedUrl);

  let res = await fetch(longFormUrl, { headers: FEED_FETCH_HEADERS });
  if (!res.ok && longFormUrl !== feedUrl) {
    // The long-form playlist fetch failed outright (not just empty) - fall
    // back to the regular channel feed rather than dropping this channel.
    res = await fetch(feedUrl, { headers: FEED_FETCH_HEADERS });
  }
  if (!res.ok) {
    throw new Error(`Fetch failed with HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = parseFeedXml(xml, feed.id, feed.name);
  return { ...parsed, resolvedUrl };
}
