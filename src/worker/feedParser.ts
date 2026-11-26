import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: true,
  cdataPropName: false,
});

type Xml = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Pull plain text out of a node that might be a string, {"#text": ...}, or an array of either. */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object") {
    const obj = node as Xml;
    if ("#text" in obj) return textOf(obj["#text"]);
  }
  return "";
}

function attr(node: unknown, name: string): string | undefined {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const v = (node as Xml)[`@_${name}`];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function firstImgSrc(html: string): string | undefined {
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match?.[1];
}

function toIso(dateLike: string | undefined | null): string | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stableItemId(feedId: string, seed: string): string {
  // Cheap, deterministic, dependency-free hash (djb2) — good enough for a React key / dedupe id.
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return `${feedId}:${(hash >>> 0).toString(36)}`;
}

function parseAtomLink(linkNode: unknown): string {
  const links = asArray<Xml>(linkNode as Xml | Xml[]);
  if (links.length === 0) return "";
  const alternate = links.find((l) => attr(l, "rel") === "alternate" || attr(l, "rel") === undefined);
  const chosen = alternate ?? links[0];
  return attr(chosen, "href") ?? textOf(chosen);
}

function parseRssItems(channel: Xml, feedId: string, feedName: string): FeedItem[] {
  const items = asArray<Xml>(channel.item as Xml | Xml[]);
  return items.map((item) => {
    const title = textOf(item.title) || "Untitled";
    const link = textOf(item.link) || attr(item.link, "href") || "";
    const contentEncoded = textOf(item.encoded); // content:encoded (ns stripped)
    const description = textOf(item.description);
    const html = contentEncoded || description || "";
    const pubDate = textOf(item.pubDate) || textOf(item.date) || textOf(item.updated);
    const guid = textOf(item.guid) || link || title;

    let imageUrl: string | undefined;
    const enclosure = item.enclosure as Xml | undefined;
    if (enclosure && (attr(enclosure, "type") ?? "").startsWith("image/")) {
      imageUrl = attr(enclosure, "url");
    }
    if (!imageUrl) {
      const thumb = item.thumbnail as Xml | Xml[] | undefined;
      const thumbNode = Array.isArray(thumb) ? thumb[0] : thumb;
      imageUrl = attr(thumbNode, "url");
    }
    if (!imageUrl) {
      const mediaContent = item.content as Xml | Xml[] | undefined;
      const contentNode = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
      if (contentNode && (attr(contentNode, "medium") === "image" || (attr(contentNode, "type") ?? "").startsWith("image/"))) {
        imageUrl = attr(contentNode, "url");
      }
    }
    if (!imageUrl && html) {
      imageUrl = firstImgSrc(html);
    }

    return {
      id: stableItemId(feedId, guid),
      feedId,
      feedName,
      title,
      link,
      publishedAt: toIso(pubDate),
      html,
      imageUrl,
    } satisfies FeedItem;
  });
}

function parseAtomEntries(feedNode: Xml, feedId: string, feedName: string): FeedItem[] {
  const entries = asArray<Xml>(feedNode.entry as Xml | Xml[]);
  return entries.map((entry) => {
    const title = textOf(entry.title) || "Untitled";
    const link = parseAtomLink(entry.link) || "";
    const group = entry.group as Xml | undefined; // media:group (yt feeds)

    const summary = textOf(entry.summary);
    const content = textOf(entry.content);
    const groupDescription = group ? textOf(group.description) : "";
    const html = content || summary || groupDescription || "";

    const published = textOf(entry.published) || textOf(entry.updated);
    const guid = textOf(entry.id) || link || title;

    let imageUrl: string | undefined;
    if (group) {
      const thumb = group.thumbnail as Xml | Xml[] | undefined;
      const thumbNode = Array.isArray(thumb) ? thumb[0] : thumb;
      imageUrl = attr(thumbNode, "url");
    }
    if (!imageUrl && html) {
      imageUrl = firstImgSrc(html);
    }

    return {
      id: stableItemId(feedId, guid),
      feedId,
      feedName,
      title,
      link,
      publishedAt: toIso(published),
      html,
      imageUrl,
    } satisfies FeedItem;
  });
}

export interface ParsedFeed {
  title?: string;
  items: FeedItem[];
}

export function parseFeedXml(xml: string, feedId: string, feedNameFallback: string): ParsedFeed {
  const doc = parser.parse(xml) as Xml;

  // Note: `title` below (the feed's own <title> element, or feedNameFallback
  // if absent) is only used for auto-naming a brand-new feed that has no name
  // yet. Each item's `feedName` always uses feedNameFallback (our own stored
  // Feed.name) directly instead, so it can never drift to match whatever the
  // upstream feed's title happens to say on a given fetch (e.g. YouTube's
  // long-form-only playlist feeds report their own <title> as just "Videos").

  if (doc.rss) {
    const channel = (doc.rss as Xml).channel as Xml;
    const title = textOf(channel?.title) || feedNameFallback;
    return { title, items: parseRssItems(channel ?? {}, feedId, feedNameFallback) };
  }

  if (doc.feed) {
    const feedNode = doc.feed as Xml;
    const title = textOf(feedNode.title) || feedNameFallback;
    return { title, items: parseAtomEntries(feedNode, feedId, feedNameFallback) };
  }

  if (doc.RDF) {
    // Minimal RSS 1.0 / RDF support, just in case.
    const rdf = doc.RDF as Xml;
    const channel = rdf.channel as Xml | undefined;
    const title = textOf(channel?.title) || feedNameFallback;
    const items = asArray<Xml>(rdf.item as Xml | Xml[]).map((item) => {
      const itemTitle = textOf(item.title) || "Untitled";
      const link = textOf(item.link) || "";
      const html = textOf(item.description) || "";
      const guid = link || itemTitle;
      return {
        id: stableItemId(feedId, guid),
        feedId,
        feedName: feedNameFallback,
        title: itemTitle,
        link,
        publishedAt: toIso(textOf(item.date)),
        html,
        imageUrl: html ? firstImgSrc(html) : undefined,
      } satisfies FeedItem;
    });
    return { title, items };
  }

  throw new Error("Unrecognized feed format (expected <rss>, <feed>, or <rdf:RDF> root element)");
}
