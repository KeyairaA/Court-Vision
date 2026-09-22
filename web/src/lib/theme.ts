import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "cv-theme";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The initial theme is set before first paint by the inline script in
 * index.html (stored choice, then system preference, then light). This hook
 * only reads it and records an explicit choice.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this visit only.
    }
    listeners.forEach((l) => l());
  }, []);
  return [theme, setTheme];
}
