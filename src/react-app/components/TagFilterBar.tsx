interface TagFilterBarProps {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export function TagFilterBar({ tags, selected, onToggle, onClear }: TagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div className="tag-filter-bar" role="group" aria-label="Filter by tag">
      <button type="button" className={`tag-chip${selected.length === 0 ? " active" : ""}`} onClick={onClear}>
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`tag-chip${selected.includes(tag) ? " active" : ""}`}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
