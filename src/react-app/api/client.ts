import type { ExtractedArticle, Feed, ItemsResponse, RefreshResponse } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export function getFeeds(): Promise<{ feeds: Feed[] }> {
  return request("/api/feeds");
}

export interface AddFeedResponse {
  status: number;
  feed?: Feed;
  error?: string;
}

/** Doesn't throw on non-2xx — the Settings form needs the status code to offer "Add anyway". */
export async function addFeed(input: { url: string; name?: string; tags?: string[]; force?: boolean }): Promise<AddFeedResponse> {
  const res = await fetch("/api/feeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let body: { feed?: Feed; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  return { status: res.status, feed: body.feed, error: body.error };
}

export function updateFeed(id: string, input: { name?: string; tags?: string[] }): Promise<{ feed: Feed }> {
  return request(`/api/feeds/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteFeed(id: string): Promise<{ ok: true }> {
  return request(`/api/feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getTags(): Promise<{ tags: string[] }> {
  return request("/api/tags");
}

export function getItems(tags: string[] = []): Promise<ItemsResponse> {
  const query = tags.length > 0 ? `?tags=${encodeURIComponent(tags.join(","))}` : "";
  return request(`/api/items${query}`);
}

export function refreshFeeds(tags: string[] = []): Promise<RefreshResponse> {
  return request("/api/refresh", { method: "POST", body: JSON.stringify({ tags }) });
}

/** Throws on failure (blocked/unreachable source site, extraction failure, etc) — callers should fall back to the feed's own summary. */
export async function getArticle(feedId: string, link: string): Promise<ExtractedArticle> {
  const query = `?feedId=${encodeURIComponent(feedId)}&link=${encodeURIComponent(link)}`;
  const res = await request<{ article: ExtractedArticle }>(`/api/article${query}`);
  return res.article;
}
