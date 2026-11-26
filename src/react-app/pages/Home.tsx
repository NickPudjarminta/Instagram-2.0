import { useCallback, useEffect, useState } from "react";
import { getItems, getTags, refreshFeeds } from "../api/client";
import type { FeedFailure, FeedItem } from "../api/types";
import { TagFilterBar } from "../components/TagFilterBar";
import { FeedCard } from "../components/FeedCard";
import { formatRelativeTime } from "../utils/time";

const PAGE_SIZE = 10;

export function Home() {
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [cachedFeeds, setCachedFeeds] = useState(0);
  const [totalFeeds, setTotalFeeds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedFailures, setFeedFailures] = useState<FeedFailure[]>([]);

  const loadItems = useCallback(async (tagsToUse: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getItems(tagsToUse);
      setItems(res.items);
      setVisibleCount(PAGE_SIZE);
      setLastUpdated(res.lastUpdated);
      setCachedFeeds(res.cachedFeeds);
      setTotalFeeds(res.totalFeeds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getTags()
      .then((res) => setTags(res.tags))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    loadItems(selectedTags);
  }, [selectedTags, loadItems]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setFeedFailures([]);
    try {
      const res = await refreshFeeds(selectedTags);
      setFeedFailures(res.feedFailures);
      await loadItems(selectedTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh feeds");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">RSS Reader</h1>
      </div>

      <div className="update-row">
        <button type="button" className="update-button" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Updating…" : "Update"}
        </button>
        <span className="last-updated">
          {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : cachedFeeds === 0 && totalFeeds > 0 ? "Never updated — press Update" : ""}
        </span>
      </div>

      {feedFailures.length > 0 && (
        <div className="feed-failures">
          Couldn't update {feedFailures.length} feed{feedFailures.length > 1 ? "s" : ""}:{" "}
          {feedFailures.map((f) => f.feedName).join(", ")}
        </div>
      )}

      <TagFilterBar tags={tags} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} />

      {loading && <div className="loading-state">Loading…</div>}
      {!loading && error && <div className="error-state">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          {totalFeeds === 0
            ? "No feeds yet. Add some from Settings."
            : "Nothing to show yet — press Update to fetch your feeds."}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="feed-list">
            {items.slice(0, visibleCount).map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>

          {visibleCount < items.length && (
            <button
              type="button"
              className="load-more-button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </>
  );
}
