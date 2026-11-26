import type { Env } from "./types";
import { getArticleCache, setArticleCache, getFeedCache } from "./storage";
import { extractArticle } from "./articleExtract";

export interface GetArticleResult {
  status: number;
  article?: {
    title: string | null;
    byline: string | null;
    siteName: string | null;
    content: string;
    excerpt: string | null;
  };
  error?: string;
}

/**
 * Returns the extracted, ad-free reading view for a feed item's link.
 * Scoped to `feedId` so this endpoint can't be used as an open fetch proxy for
 * arbitrary URLs - the link must belong to one of that feed's cached items.
 */
export async function getArticle(env: Env, feedId: string, link: string): Promise<GetArticleResult> {
  const feedCache = await getFeedCache(env, feedId);
  const knownItem = feedCache?.items.find((item) => item.link === link);
  if (!knownItem) {
    return { status: 404, error: "That link isn't a known item for this feed." };
  }

  const cached = await getArticleCache(env, link);
  if (cached) {
    const { title, byline, siteName, content, excerpt } = cached;
    return { status: 200, article: { title, byline, siteName, content, excerpt } };
  }

  try {
    const extracted = await extractArticle(link);
    await setArticleCache(env, link, { ...extracted, fetchedAt: new Date().toISOString() });
    return { status: 200, article: extracted };
  } catch (err) {
    return {
      status: 502,
      error: err instanceof Error ? err.message : "Couldn't load the full article from the source site.",
    };
  }
}
