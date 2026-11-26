import type { Env } from "./types";
import { getFeedsConfig } from "./storage";
import { addFeed, updateFeed, removeFeed, listTags } from "./feedsApi";
import { aggregateItems, refreshFeeds } from "./aggregate";
import { getArticle } from "./articleApi";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function parseTagsParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  const method = request.method;

  try {
    // /api/feeds
    if (pathname === "/api/feeds") {
      if (method === "GET") {
        const config = await getFeedsConfig(env);
        return json({ feeds: config.feeds });
      }
      if (method === "POST") {
        const body = await readJsonBody(request);
        const result = await addFeed(env, body);
        if (result.error) return json({ error: result.error }, result.status);
        return json({ feed: result.feed }, result.status);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/feeds/:id
    const feedMatch = pathname.match(/^\/api\/feeds\/([^/]+)$/);
    if (feedMatch) {
      const feedId = decodeURIComponent(feedMatch[1]);
      if (method === "PATCH") {
        const body = await readJsonBody(request);
        const feed = await updateFeed(env, feedId, body);
        if (!feed) return json({ error: "Feed not found" }, 404);
        return json({ feed });
      }
      if (method === "DELETE") {
        const removed = await removeFeed(env, feedId);
        if (!removed) return json({ error: "Feed not found" }, 404);
        return json({ ok: true });
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/tags
    if (pathname === "/api/tags") {
      if (method === "GET") {
        const tags = await listTags(env);
        return json({ tags });
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/items?tags=a,b
    if (pathname === "/api/items") {
      if (method === "GET") {
        const tags = parseTagsParam(url.searchParams.get("tags"));
        const result = await aggregateItems(env, tags);
        return json(result);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/article?feedId=...&link=...
    if (pathname === "/api/article") {
      if (method === "GET") {
        const feedId = url.searchParams.get("feedId");
        const link = url.searchParams.get("link");
        if (!feedId || !link) {
          return json({ error: "feedId and link are required" }, 400);
        }
        const result = await getArticle(env, feedId, link);
        if (result.error) return json({ error: result.error }, result.status);
        return json({ article: result.article }, result.status);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/refresh
    if (pathname === "/api/refresh") {
      if (method === "POST") {
        const body = await readJsonBody(request);
        const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
        const result = await refreshFeeds(env, tags);
        return json(result);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("API error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
