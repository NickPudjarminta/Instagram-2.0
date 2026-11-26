import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "../api/types";
import { formatRelativeTime } from "../utils/time";
import { colorForName, initialsForName } from "../utils/avatarColor";
import { sanitizeHtml, sanitizeArticleHtml } from "../utils/sanitize";
import { getYoutubeVideoId } from "../utils/youtube";
import { getArticle } from "../api/client";

interface FeedCardProps {
  item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const videoId = getYoutubeVideoId(item.link);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [item.html, expanded]);

  const displayHtml = expanded && fullContent ? sanitizeArticleHtml(fullContent) : sanitizeHtml(item.html);

  const handleShowMore = async () => {
    setExpanded(true);
    // Video descriptions are already complete (nothing to fetch); once we
    // already have the full article (or are fetching it), don't re-fetch.
    if (videoId || fullContent || loadingFull) return;

    setLoadingFull(true);
    setFullError(null);
    try {
      const article = await getArticle(item.feedId, item.link);
      setFullContent(article.content);
    } catch (err) {
      setFullError(err instanceof Error ? err.message : "Couldn't load the full article.");
    } finally {
      setLoadingFull(false);
    }
  };

  // Non-video items always offer "Show more" - even a short RSS teaser may
  // have a full article behind it. Video items only need the toggle when
  // their (already-complete) description actually overflows the clamp.
  const showMoreVisible = videoId ? overflowing && !expanded : !expanded;
  const showLessVisible = videoId ? overflowing && expanded : expanded;

  return (
    <article className="feed-card">
      <header className="feed-card-header">
        <div className="feed-avatar" style={{ background: colorForName(item.feedName) }}>
          {initialsForName(item.feedName)}
        </div>
        <div className="feed-meta">
          <span className="feed-name">{item.feedName}</span>
          <span className="feed-time">{formatRelativeTime(item.publishedAt)}</span>
        </div>
      </header>

      {item.title && <h3 className="feed-card-title">{item.title}</h3>}

      {videoId ? (
        <div className="video-embed-wrapper">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title={item.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        // Hide the RSS thumbnail once the full article (with its own lead
        // image) has loaded; keep it visible while loading or on failure.
        !fullContent && item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />
      )}

      {displayHtml && (
        <div
          ref={bodyRef}
          className={`feed-card-body${expanded ? "" : " clamped"}`}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      )}

      {loadingFull && <div className="loading-inline">Loading full article…</div>}
      {fullError && (
        <div className="form-message error inline-notice">
          Couldn't load the full article ({fullError}) — showing the feed summary.
        </div>
      )}

      {showMoreVisible && (
        <button type="button" className="show-more-button" onClick={handleShowMore}>
          Show more
        </button>
      )}
      {showLessVisible && (
        <button type="button" className="show-more-button" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </article>
  );
}
