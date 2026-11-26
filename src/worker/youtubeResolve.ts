// Ordered by reliability: the canonical link and externalId are always the
// current page's own channel; a bare "UC..." scan anywhere in the HTML is too
// risky because unrelated obfuscated blobs (ad configs, etc.) can coincidentally
// match the same shape and point at a completely different channel.
const CHANNEL_ID_PATTERNS: RegExp[] = [
  /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
  /"externalId":"(UC[a-zA-Z0-9_-]{22})"/,
  /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
];

function extractChannelId(html: string): string | null {
  for (const pattern of CHANNEL_ID_PATTERNS) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Given any URL the user pasted, return the canonical YouTube "videos.xml" RSS
 * feed URL if it's a YouTube channel/handle/user page, otherwise return the
 * URL unchanged (it's assumed to already be a direct feed URL).
 */
export async function resolveFeedUrl(inputUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const isYoutube = host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  if (!isYoutube) {
    return inputUrl;
  }

  if (parsed.pathname === "/feeds/videos.xml") {
    return inputUrl; // already a raw feed URL
  }

  // /channel/UC... — the id is right there in the URL, no fetch needed.
  const channelMatch = parsed.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return youtubeFeedUrl(channelMatch[1]);
  }

  // /@handle, /c/name, /user/name, or a bare channel URL — fetch the page and
  // scrape the canonical channel id out of it.
  const pageUrl = `https://www.youtube.com${parsed.pathname}${parsed.search}`;
  const res = await fetch(pageUrl, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Could not load YouTube page to resolve channel id (HTTP ${res.status}).`);
  }
  const html = await res.text();
  const channelId = extractChannelId(html);
  if (!channelId) {
    throw new Error("Could not find a YouTube channel id on that page.");
  }
  return youtubeFeedUrl(channelId);
}

/**
 * Rewrites a YouTube channel videos.xml feed URL (`channel_id=UC...`) to that
 * channel's undocumented-but-stable "long-form videos only" playlist feed
 * (`playlist_id=UULF...`), which excludes Shorts and live streams. Anything
 * else (non-YouTube feeds, already-`playlist_id` feeds, malformed URLs) is
 * returned unchanged so a deliberately-chosen playlist variant isn't overridden.
 */
export function toLongFormFeedUrl(feedUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return feedUrl;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" || parsed.pathname !== "/feeds/videos.xml") {
    return feedUrl;
  }

  const channelId = parsed.searchParams.get("channel_id");
  if (!channelId || !channelId.startsWith("UC")) {
    return feedUrl; // already playlist_id-based, or some other shape - leave alone
  }

  const playlistId = `UULF${channelId.slice(2)}`;
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
}

export function looksLikeYoutubePage(inputUrl: string): boolean {
  try {
    const parsed = new URL(inputUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    const isYoutube = host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
    return isYoutube && parsed.pathname !== "/feeds/videos.xml";
  } catch {
    return false;
  }
}
