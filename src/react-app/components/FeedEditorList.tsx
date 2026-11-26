import { useState } from "react";
import { deleteFeed, updateFeed } from "../api/client";
import type { Feed } from "../api/types";

interface FeedEditorListProps {
  feeds: Feed[];
  allTags: string[];
  onChange: (feeds: Feed[]) => void;
}

export function FeedEditorList({ feeds, allTags, onChange }: FeedEditorListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggleTag = async (feed: Feed, tag: string) => {
    const nextTags = feed.tags.includes(tag) ? feed.tags.filter((t) => t !== tag) : [...feed.tags, tag];
    setPendingId(feed.id);
    try {
      const res = await updateFeed(feed.id, { tags: nextTags });
      onChange(feeds.map((f) => (f.id === feed.id ? res.feed : f)));
    } catch {
      // best-effort — leave the list as-is if the update failed
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (feed: Feed) => {
    if (!window.confirm(`Remove "${feed.name}"?`)) return;
    setPendingId(feed.id);
    try {
      await deleteFeed(feed.id);
      onChange(feeds.filter((f) => f.id !== feed.id));
    } catch {
      // best-effort
    } finally {
      setPendingId(null);
    }
  };

  if (feeds.length === 0) {
    return <p className="form-message">No feeds yet.</p>;
  }

  return (
    <div className="feed-editor-list">
      {feeds.map((feed) => (
        <div key={feed.id} className="feed-editor-row">
          <div className="feed-editor-top">
            <div>
              <div className="feed-editor-name">{feed.name}</div>
              <div className="feed-editor-url">{feed.url}</div>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={pendingId === feed.id}
              onClick={() => handleDelete(feed)}
            >
              Remove
            </button>
          </div>
          <div className="feed-editor-tags">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-chip${feed.tags.includes(tag) ? " active" : ""}`}
                disabled={pendingId === feed.id}
                onClick={() => toggleTag(feed, tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
