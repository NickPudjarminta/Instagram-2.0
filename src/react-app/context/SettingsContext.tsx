import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const FONT_SIZE_KEY = "rss-reader:font-size";
export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 16;

function loadFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  const raw = window.localStorage.getItem(FONT_SIZE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
    return parsed;
  }
  return DEFAULT_FONT_SIZE;
}

interface SettingsContextValue {
  fontSize: number;
  setFontSize: (size: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<number>(loadFontSize);

  useEffect(() => {
    document.documentElement.style.setProperty("--base-font-size", `${fontSize}px`);
    window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  const setFontSize = (size: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    setFontSizeState(clamped);
  };

  const value = useMemo(() => ({ fontSize, setFontSize }), [fontSize]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
