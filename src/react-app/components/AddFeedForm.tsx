import { useState } from "react";
import { addFeed } from "../api/client";
import type { Feed } from "../api/types";

interface AddFeedFormProps {
  existingTags: string[];
  onAdded: (feed: Feed) => void;
}

export function AddFeedForm({ existingTags, onAdded }: AddFeedFormProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const allTags = Array.from(new Set([...existingTags, ...selectedTags]));

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addNewTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setNewTag("");
  };

  const reset = () => {
    setUrl("");
    setName("");
    setSelectedTags([]);
    setNewTag("");
    setCanForce(false);
  };

  const submit = async (force: boolean) => {
    if (!url.trim()) {
      setError("Paste a feed URL first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await addFeed({ url: url.trim(), name: name.trim() || undefined, tags: selectedTags, force });
      if (res.status >= 200 && res.status < 300 && res.feed) {
        onAdded(res.feed);
        setSuccess(`Added "${res.feed.name}".`);
        reset();
      } else {
        setError(res.error ?? "Something went wrong adding that feed.");
        setCanForce(res.status === 422);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong adding that feed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Add a feed</h2>
      <form
        className="add-feed-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div>
          <label className="field-label" htmlFor="feed-url">
            Feed URL
          </label>
          <input
            id="feed-url"
            className="text-input"
            type="text"
            placeholder="https://example.com/feed or a YouTube channel URL"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setCanForce(false);
            }}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="feed-name">
            Name (optional — auto-detected if left blank)
          </label>
          <input
            id="feed-name"
            className="text-input"
            type="text"
            placeholder="Auto-detected from the feed"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <span className="field-label">Tags</span>
          <div className="tag-picker">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-chip${selectedTags.includes(tag) ? " active" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="tag-picker">
            <input
              className="text-input"
              type="text"
              placeholder="New tag…"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              style={{ maxWidth: 160 }}
            />
            <button type="button" className="icon-button" onClick={addNewTag}>
              Add tag
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Adding…" : "Add feed"}
          </button>
          {canForce && (
            <button type="button" className="icon-button" disabled={submitting} onClick={() => submit(true)}>
              Add anyway
            </button>
          )}
        </div>

        {error && <div className="form-message error">{error}</div>}
        {success && <div className="form-message success">{success}</div>}
      </form>
    </section>
  );
}
