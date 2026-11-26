import { parseHTML } from "linkedom/worker";
import { Readability } from "@mozilla/readability";

const ARTICLE_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 RSSReader/1.0",
  Accept: "text/html,application/xhtml+xml",
};

export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  content: string;
  excerpt: string | null;
}

function resolveRelativeUrls(document: any, baseUrl: string): void {
  for (const a of document.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (href) {
      try {
        a.setAttribute("href", new URL(href, baseUrl).href);
      } catch {
        // leave malformed URLs as-is
      }
    }
  }
  for (const tag of ["img", "source"]) {
    for (const el of document.querySelectorAll(tag)) {
      const src = el.getAttribute("src");
      if (src) {
        try {
          el.setAttribute("src", new URL(src, baseUrl).href);
        } catch {
          // leave malformed URLs as-is
        }
      }
    }
  }
}

/**
 * Many sites (especially JS-rendered ones) don't expose their hero/content
 * images as plain <img src> in the server-rendered HTML that Readability can
 * see (they're injected client-side, or shown via CSS background-image).
 * The Open Graph image meta tag is almost universally server-rendered for
 * social-sharing purposes though, so it's a reliable fallback lead image.
 */
function getOgImage(document: any, baseUrl: string): string | null {
  const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
  const content = meta?.getAttribute("content");
  if (!content) return null;
  try {
    return new URL(content, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Fetches an article page and extracts just the readable content (title,
 * byline, body text + images) the same way Firefox's Reader View does,
 * stripping navigation, ads, sidebars, and comments.
 * Throws a human-readable error on any failure.
 */
export async function extractArticle(url: string): Promise<ExtractedArticle> {
  const res = await fetch(url, { headers: ARTICLE_FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Fetch failed with HTTP ${res.status}`);
  }
  const html = await res.text();

  const { document } = parseHTML(html);
  const ogImage = getOgImage(document, url);
  resolveRelativeUrls(document, url);

  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error("Could not extract article content from that page");
  }

  // Always lead with the page's Open Graph image when available: many sites
  // render their actual content photos client-side or via CSS
  // background-image (invisible to a static HTML fetch), so relying solely
  // on <img> tags Readability found in the body would often leave the
  // article looking text-only even though a perfectly good cover image
  // exists. Skip it only if that exact image is already inline in the body.
  let content: string = article.content;
  if (ogImage && !content.includes(ogImage)) {
    content = `<figure><img src="${ogImage}" alt=""></figure>${content}`;
  }

  return {
    title: article.title ?? null,
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    content,
    excerpt: article.excerpt ?? null,
  };
}
