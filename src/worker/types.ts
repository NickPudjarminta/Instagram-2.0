export interface Env {
  RSS_KV: KVNamespace;
  ASSETS: Fetcher;
}

export interface Feed {
  id: string;
  name: string;
  url: string;
  tags: string[];
  /** Original URL the user pasted, if it differed from the resolved feed URL (e.g. a YouTube handle page). */
  sourceUrl?: string;
}

export interface FeedsConfig {
  feeds: Feed[];
}

export interface FeedItem {
  id: string;
  feedId: string;
  feedName: string;
  title: string;
  link: string;
  publishedAt: string | null;
  html: string;
  imageUrl?: string;
}

export interface FeedCacheEntry {
  fetchedAt: string;
  items: FeedItem[];
}

export interface FeedFailure {
  feedId: string;
  feedName: string;
  error: string;
}

export interface ArticleCacheEntry {
  fetchedAt: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  content: string;
  excerpt: string | null;
}
