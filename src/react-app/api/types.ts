export interface Feed {
  id: string;
  name: string;
  url: string;
  tags: string[];
  sourceUrl?: string;
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

export interface FeedFailure {
  feedId: string;
  feedName: string;
  error: string;
}

export interface ItemsResponse {
  items: FeedItem[];
  lastUpdated: string | null;
  totalFeeds: number;
  cachedFeeds: number;
}

export interface RefreshResponse {
  feedFailures: FeedFailure[];
  refreshedFeedIds: string[];
  lastUpdated: string;
}

export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  content: string;
  excerpt: string | null;
}
