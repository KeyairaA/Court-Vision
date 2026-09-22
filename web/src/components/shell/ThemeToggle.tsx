import { useTheme, type Theme } from "../../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const option = (value: Theme, label: string) => (
    <button
      type="button"
      aria-pressed={theme === value}
      onClick={() => setTheme(value)}
      className={`h-9 flex-1 rounded-[3px] font-display text-sm font-bold uppercase tracking-[0.08em] ${
        theme === value ? "bg-chrome-ink text-chrome" : "text-chrome-ink-2 hover:text-chrome-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Color theme" className="flex gap-0.5 rounded bg-chrome-raised p-0.5">
      {option("light", "Light")}
      {option("dark", "Dark")}
    </div>
  );
}
