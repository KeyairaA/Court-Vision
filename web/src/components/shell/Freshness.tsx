import { Link } from "react-router";
import type { Manifest } from "../../data/contract";
import { longDate } from "../../lib/format";

/**
 * "Data through" is when the source last published, not when the build ran.
 * The two differ, and a visitor deserves to know which one they are reading.
 */
export function Freshness({ manifest, tone = "chrome" }: { manifest: Manifest | undefined; tone?: "chrome" | "page" }) {
  const published = longDate(manifest?.source.latest_published_at);
  const strong = tone === "chrome" ? "text-chrome-ink" : "text-ink";
  const soft = tone === "chrome" ? "text-chrome-ink-2" : "text-ink-2";
  return (
    <p className={`m-0 text-[13px] leading-relaxed ${soft}`}>
      <span className={`font-semibold ${strong}`}>{published ? `Data through ${published}` : "Loading data date"}</span>
      <br />
      {manifest ? `Regular seasons ${manifest.window.first} to ${manifest.window.last}` : null}
      <br />
      <Link to="/how-it-works" className={`underline ${strong}`}>
        How it is calculated
      </Link>
    </p>
  );
}
