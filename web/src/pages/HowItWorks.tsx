import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { FranchiseTimeline, timelineRows } from "../components/charts/FranchiseTimeline";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Controls";
import { Kpi } from "../components/ui/Kpi";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../components/ui/States";
import type { FranchiseRecord, LeagueSeasonRecord, Manifest } from "../data/contract";
import { useArtifact } from "../data/useArtifact";
import { longDate, shortDate } from "../lib/format";
import { seasonNotes } from "../lib/seasons";

export const SECTIONS = [
  { id: "source", title: "Where the data comes from" },
  { id: "checks", title: "Checks every build runs" },
  { id: "true-shooting", title: "True shooting" },
  { id: "league", title: "League averages" },
  { id: "careers", title: "Career numbers" },
  { id: "samples", title: "Short seasons and minimums" },
  { id: "franchises", title: "Franchise continuity" },
  { id: "caveats", title: "Seasons with caveats" },
] as const;

export default function HowItWorks() {
  const manifest = useArtifact("manifest");
  const trends = useArtifact("league-trends");
  const franchises = useArtifact("franchises");
  for (const a of [manifest, trends, franchises]) {
    if (a.status === "error") return <ErrorState error={a.error} retry={a.retry} />;
  }
  if (manifest.status !== "ready" || trends.status !== "ready" || franchises.status !== "ready") return <LoadingState blocks={[160, 600, 500]} />;
  return <HowItWorksView manifest={manifest.data} trends={trends.data} franchises={franchises.data} />;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-28 flex-col gap-4 lg:scroll-mt-8" id={`${id}-section`}>
      <h2 id={id} className="m-0 scroll-mt-28 font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.02em] text-ink md:text-[34px] lg:scroll-mt-8">
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="m-0 max-w-[68ch] text-base leading-relaxed text-ink md:text-[17px]">{children}</p>;
}

/** Scroll to #anchor on arrival and on in-page navigation; the router does not do it for us. */
function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    el?.scrollIntoView({ block: "start" });
  }, [hash]);
}

export function HowItWorksView({ manifest, trends, franchises }: { manifest: Manifest; trends: LeagueSeasonRecord[]; franchises: FranchiseRecord[] }) {
  useHashScroll();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const current = SECTIONS.find((s) => `#${s.id}` === hash)?.id ?? SECTIONS[0].id;

  const { first, last } = manifest.window;
  const q = manifest.quality[String(last)];
  const latestTrend = trends.find((t) => t.season === last);
  const notes = seasonNotes(trends, manifest);
  const coefficient = manifest.methodology.true_shooting_ft_coefficient;
  const published = longDate(manifest.source.latest_published_at);
  const rows = timelineRows(franchises, last);

  const flow = [
    { name: "stats.nba.com", text: "Official box scores" },
    { name: "sportsdataverse", text: "Public mirror, updated daily" },
    { name: "Court Vision build", text: "Checks, then publishes", dark: true },
    { name: "This site", text: "Static files on a CDN" },
  ];

  const body = (
    <article className="flex min-w-0 flex-col gap-12">
      <Section id="source" title="Where the data comes from">
        <P>
          Every number starts as an official WNBA box score from stats.nba.com. Court Vision reads them from the sportsdataverse mirror, a public copy that
          updates daily, because the official site blocks the cloud servers a scheduled job runs on.
        </P>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0 md:flex-row md:items-stretch" aria-label="How data reaches this site">
          {flow.map((s, i) => (
            <li key={s.name} className="flex flex-col gap-2.5 md:flex-1 md:flex-row md:items-center">
              <div className={`flex flex-1 flex-col gap-1 rounded px-4 py-3.5 ${s.dark ? "bg-chrome text-chrome-ink" : "border border-line bg-card text-ink"}`}>
                <span className="font-display text-lg font-extrabold uppercase tracking-[0.03em]">{s.name}</span>
                <span className={`text-sm ${s.dark ? "text-chrome-ink-2" : "text-ink-2"}`}>{s.text}</span>
              </div>
              {i < flow.length - 1 ? (
                <svg width="18" height="18" aria-hidden="true" className="shrink-0 self-center stroke-ink-2 max-md:rotate-90" style={{ fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M2 9 H16 M11 4 L16 9 L11 14" />
                </svg>
              ) : null}
            </li>
          ))}
        </ol>
        <P>
          <strong>Data through {published ?? "the last publish"}</strong> is when the source last published, not when this site was built. A build that
          finds nothing new changes nothing. Regular seasons {first} to {last} are covered.
        </P>
      </Section>

      <Section id="checks" title="Checks every build runs">
        <P>
          Player lines must add up to team totals, game by game, for every stat except turnovers. Teams are charged turnovers that no player is, so team
          turnovers can run higher. A build that fails any check publishes nothing, and the site keeps serving the last good data.
        </P>
        {q ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Kpi label={`${last} games`} value={String(q.games_played)} />
            <Kpi label="Team-games reconciled" value={`${q.team_games_reconciled} / ${q.games_played * 2}`} />
            <Kpi label="Games filled from box scores" value={String(q.filled_games)} />
          </div>
        ) : null}
        <P>
          {q && q.filled_games > 0
            ? `In ${last} the mirror's player file stopped short. The ${q.filled_games} missing games were filled from box scores and passed the same check before publishing. `
            : ""}
          If a season is ever incomplete, a banner on every page says how far its player stats reach
          {q?.last_covered_date ? ` (the latest season is currently covered through ${shortDate(q.last_covered_date)})` : ""}.
        </P>
      </Section>

      <Section id="true-shooting" title="True shooting">
        <P>
          True shooting measures points per scoring attempt, counting threes and free throws fairly. Free throws come in pairs and some end no possession,
          so each one counts as {coefficient} of an attempt.
        </P>
        <div className="flex flex-col gap-2 rounded bg-chrome px-6 py-5 text-chrome-ink">
          <span className="font-display text-sm font-bold uppercase tracking-[0.12em] text-chrome-ink-2">Formula</span>
          <span className="font-display text-[22px] font-bold tracking-[0.02em] md:text-3xl">
            TS% = PTS ÷ (2 × (FGA + <span className="text-accent">{coefficient}</span> × FTA))
          </span>
        </div>
      </Section>

      <Section id="league" title="League averages">
        <P>
          League numbers are team totals divided by team-games, not the average of player averages.
          {latestTrend && q
            ? ` In ${last} that is every team point scored across ${q.team_games_reconciled} team-games: ${latestTrend.pts_per_team_game.toFixed(1)} per team-game.`
            : ""}{" "}
          Averaging players would overweight bench minutes.
        </P>
      </Section>

      <Section id="careers" title="Career numbers">
        <P>
          Careers are totals within the {first} to {last} window, divided by games. A 13-game season counts for 13 games, not one-ninth of a career. Players
          who debuted before {first} show only their window seasons, and every comparison says how many games it rests on.
        </P>
      </Section>

      <Section id="samples" title="Short seasons and minimums">
        <P>
          A season counts as short when a player appears in fewer than half of her team's games. Short seasons are drawn as open circles on every chart, so a
          13-game year never reads as a slump. A season a player missed is left as a gap, never filled in.
        </P>
        <P>
          The leaderboard uses the same line by default: at least half of that season's games. Shooting percentages also need volume: 5 field goal attempts a
          game for true shooting and field goal percentage, 2 three-point attempts for three-point percentage, and 2 assists for assist-to-turnover ratio.
          Rates with no attempts show n/a, never zero.
        </P>
      </Section>

      <Section id="franchises" title="Franchise continuity">
        <P>
          The source identifies teams by an ID, and an ID is not always a franchise. Court Vision keeps its own registry, so relabels stay one line and unrelated
          teams never merge.
        </P>
        <Card>
          <FranchiseTimeline rows={rows} windowFirst={first} windowLast={last} />
        </Card>
      </Section>

      <Section id="caveats" title="Seasons with caveats">
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(manifest.confounded_seasons).map(([season, detail]) => (
            <div key={season} className="flex flex-col gap-1.5 rounded bg-chrome px-5 py-4 text-chrome-ink">
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-4xl font-extrabold leading-none">{season}</span>
                <span className="font-display text-base font-bold uppercase tracking-[0.08em] text-accent">{notes.get(Number(season))?.short ?? "Caveat"}</span>
              </div>
              <p className="m-0 text-[15px] leading-normal text-chrome-ink-2">{detail}.</p>
            </div>
          ))}
        </div>
        <P>
          These seasons are shaded wherever they appear. Explore them on <Link to="/" className="font-semibold underline">league trends</Link>.
        </P>
      </Section>
    </article>
  );

  return (
    <>
      <title>How it Works · Court Vision</title>
      <PageHeader
        eyebrow="How it Works"
        title="How Court Vision calculates"
        sub="Where the numbers come from, the checks they pass, and the choices behind them."
      />
      <div className="lg:hidden">
        <Select
          label="Jump to"
          value={current}
          options={SECTIONS.map((s) => ({ value: s.id, label: s.title }))}
          onChange={(id) => navigate({ hash: id }, { replace: true })}
        />
      </div>
      <div className="flex items-start gap-14">
        <div className="min-w-0 max-w-[820px] flex-1">{body}</div>
        <nav aria-label="On this page" className="sticky top-8 hidden w-60 shrink-0 flex-col gap-1 lg:flex">
          <span className="label-caps mb-1.5">On this page</span>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={current === s.id ? "location" : undefined}
              className={`block py-2 pl-3.5 text-[15px] ${current === s.id ? "font-bold text-ink shadow-[inset_3px_0_0_var(--color-accent)]" : "text-ink-2 hover:text-ink"}`}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
