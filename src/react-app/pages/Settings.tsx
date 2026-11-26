import { useEffect, useState } from "react";
import { getFeeds } from "../api/client";
import type { Feed } from "../api/types";
import { FontSizeControl } from "../components/FontSizeControl";
import { AddFeedForm } from "../components/AddFeedForm";
import { FeedEditorList } from "../components/FeedEditorList";

export function Settings() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFeeds()
      .then((res) => setFeeds(res.feeds))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load feeds"))
      .finally(() => setLoading(false));
  }, []);

  const allTags = Array.from(new Set(feeds.flatMap((f) => f.tags))).sort((a, b) => a.localeCompare(b));

  return (
    <>
      <h1 className="settings-title">Settings</h1>

      <FontSizeControl />

      <AddFeedForm existingTags={allTags} onAdded={(feed) => setFeeds((prev) => [...prev, feed])} />

      <section className="settings-section">
        <h2>Your feeds</h2>
        {loading && <p className="form-message">Loading…</p>}
        {!loading && error && <p className="form-message error">{error}</p>}
        {!loading && !error && <FeedEditorList feeds={feeds} allTags={allTags} onChange={setFeeds} />}
      </section>
    </>
  );
}
