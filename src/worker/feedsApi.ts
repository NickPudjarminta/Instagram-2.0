import type { Env, Feed } from "./types";
import { getFeedsConfig, saveFeedsConfig, generateFeedId, deleteFeedCache } from "./storage";
import { fetchAndParseFeed } from "./feedFetch";

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return Array.from(new Set(cleaned));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface AddFeedInput {
  url?: unknown;
  name?: unknown;
  tags?: unknown;
  force?: unknown;
}

export interface AddFeedResult {
  feed?: Feed;
  error?: string;
  status: number;
}

export async function addFeed(env: Env, input: AddFeedInput): Promise<AddFeedResult> {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) {
    return { error: "A feed URL is required.", status: 400 };
  }

  let parsedOk = true;
  try {
    new URL(url);
  } catch {
    parsedOk = false;
  }
  if (!parsedOk) {
    return { error: "That doesn't look like a valid URL.", status: 400 };
  }

  const config = await getFeedsConfig(env);
  if (config.feeds.some((f) => f.url === url)) {
    return { error: "That feed has already been added.", status: 409 };
  }

  const id = generateFeedId();
  const providedName = typeof input.name === "string" ? input.name.trim() : "";
  const force = input.force === true;

  let resolvedUrl = url;
  let derivedName = providedName || hostnameOf(url);

  try {
    const result = await fetchAndParseFeed({ id, name: providedName || hostnameOf(url), url });
    resolvedUrl = result.resolvedUrl ?? url;
    if (!providedName && result.title) derivedName = result.title;
  } catch (err) {
    if (!force) {
      return {
        error: `Couldn't load that feed (${err instanceof Error ? err.message : String(err)}). You can retry, or add it anyway from Settings.`,
        status: 422,
      };
    }
    // force === true: fall through and save with best-effort url/name even though validation failed.
  }

  const feed: Feed = {
    id,
    name: derivedName,
    url: resolvedUrl,
    tags: normalizeTags(input.tags),
    ...(resolvedUrl !== url ? { sourceUrl: url } : {}),
  };

  config.feeds.push(feed);
  await saveFeedsConfig(env, config);

  return { feed, status: 201 };
}

export interface UpdateFeedInput {
  name?: unknown;
  tags?: unknown;
}

export async function updateFeed(env: Env, feedId: string, input: UpdateFeedInput): Promise<Feed | null> {
  const config = await getFeedsConfig(env);
  const feed = config.feeds.find((f) => f.id === feedId);
  if (!feed) return null;

  if (typeof input.name === "string" && input.name.trim()) {
    feed.name = input.name.trim();
  }
  if (input.tags !== undefined) {
    feed.tags = normalizeTags(input.tags);
  }

  await saveFeedsConfig(env, config);
  return feed;
}

export async function removeFeed(env: Env, feedId: string): Promise<boolean> {
  const config = await getFeedsConfig(env);
  const index = config.feeds.findIndex((f) => f.id === feedId);
  if (index === -1) return false;

  config.feeds.splice(index, 1);
  await saveFeedsConfig(env, config);
  await deleteFeedCache(env, feedId);
  return true;
}

export async function listTags(env: Env): Promise<string[]> {
  const config = await getFeedsConfig(env);
  const tags = new Set<string>();
  for (const feed of config.feeds) {
    for (const tag of feed.tags) tags.add(tag);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}
