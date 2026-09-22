import { Link } from "react-router";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

/** Temporary page for views that are designed but not built yet. */
export function ComingNext({ eyebrow, title, summary }: { eyebrow: string; title: string; summary: string }) {
  return (
    <>
      <title>{`${title} · Court Vision`}</title>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card>
        <p className="m-0 max-w-prose text-[17px] leading-relaxed text-ink">{summary}</p>
        <p className="m-0 text-[15px] text-ink-2">
          This view is being built next. In the meantime, <Link to="/" className="font-semibold text-ink underline">league trends</Link> are live.
        </p>
      </Card>
    </>
  );
}

export const Leaders = () => (
  <ComingNext eyebrow="Leaderboard" title="Leaders" summary="Rank any season by points, rebounds, assists, efficiency and more, per game or per 36 minutes, with true shooting beside every scoring line." />
);
export const Compare = () => (
  <ComingNext eyebrow="Player comparison" title="Compare" summary="Two players side by side, per game, with the sample size stated up front so a three-season career is never read as a nine-season one." />
);
export const Players = () => (
  <ComingNext eyebrow="Player profile" title="Players" summary="Every season for any player in the 2017 to 2026 window, with short seasons marked so a 13-game year never reads as a slump." />
);
export const HowItWorks = () => (
  <ComingNext eyebrow="How it Works" title="How Court Vision calculates" summary="Where the numbers come from, the checks they pass before publishing, and the choices behind true shooting, league averages and careers." />
);
