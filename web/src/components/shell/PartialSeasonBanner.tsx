import { Link } from "react-router";
import type { Manifest } from "../../data/contract";
import { partialSeasonMessage } from "../../lib/seasons";

/** Shown on every page whenever the pipeline reports a season with missing player games. */
export function PartialSeasonBanner({ manifest }: { manifest: Manifest }) {
  const message = partialSeasonMessage(manifest);
  if (!message) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded bg-notice px-4 py-3.5 text-[15px] leading-snug text-ink">
      <svg width="20" height="20" aria-hidden="true" className="mt-px shrink-0 stroke-notice-ink" style={{ fill: "none" }}>
        <circle cx="10" cy="10" r="8.5" style={{ strokeWidth: 1.5 }} />
        <line x1="10" y1="5.5" x2="10" y2="11" style={{ strokeWidth: 2, strokeLinecap: "round" }} />
        <circle cx="10" cy="14.2" r="1.2" className="fill-notice-ink" style={{ stroke: "none" }} />
      </svg>
      <p className="m-0">
        <strong className="font-bold">{message}</strong> League trends use team totals and are complete. Player rankings will change as
        the source catches up.{" "}
        <Link to="/how-it-works#checks" className="underline">
          Why this happens
        </Link>
      </p>
    </div>
  );
}
