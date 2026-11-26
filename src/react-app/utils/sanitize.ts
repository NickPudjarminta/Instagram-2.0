import DOMPurify from "dompurify";

let hookRegistered = false;

function ensureHook() {
  if (hookRegistered) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  hookRegistered = true;
}

const ALLOWED_TAGS = ["p", "br", "b", "strong", "i", "em", "a", "img", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "span"];
const ALLOWED_ATTR = ["href", "src", "alt", "title"];

export function sanitizeHtml(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// Slightly broader allow-list for the fetched full-article content (fetched
// on "Show more"), which can reasonably include figures/captions, code
// blocks, and horizontal rules that a short feed summary wouldn't have.
const ARTICLE_ALLOWED_TAGS = [...ALLOWED_TAGS, "figure", "figcaption", "hr", "pre", "code"];

export function sanitizeArticleHtml(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS, ALLOWED_ATTR });
}
