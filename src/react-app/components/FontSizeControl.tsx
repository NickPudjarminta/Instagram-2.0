import { MAX_FONT_SIZE, MIN_FONT_SIZE, useSettings } from "../context/SettingsContext";

export function FontSizeControl() {
  const { fontSize, setFontSize } = useSettings();

  return (
    <section className="settings-section">
      <h2>Font size</h2>
      <div className="font-size-row">
        <input
          type="range"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          aria-label="Font size"
        />
        <span>{fontSize}px</span>
      </div>
      <div className="font-size-preview" style={{ fontSize: `${fontSize}px` }}>
        The quick brown fox jumps over the lazy dog.
      </div>
    </section>
  );
}
