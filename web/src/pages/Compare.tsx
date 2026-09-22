import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { LineChart, Legend, type ChartBand } from "../components/charts/LineChart";
import { Card, CardHead } from "../components/ui/Card";
import { Segmented, Select } from "../components/ui/Controls";
import { PageHeader } from "../components/ui/PageHeader";
import { PlayerSearch } from "../components/ui/PlayerSearch";
import { ErrorState, LoadingState } from "../components/ui/States";
import type { CareerRecord, FranchiseRecord, LeagueSeasonRecord, Manifest, PlayerSeasonRecord } from "../data/contract";
import { useArtifact } from "../data/useArtifact";
import { headToHead, sampleSentence, type PerGame } from "../lib/compare";
import { fixed, NA, percent } from "../lib/format";
import { statByKey, supportsPer36, type Basis, type StatKey } from "../lib/leaders";
import { franchiseNames } from "../lib/players";
import { seasonNotes } from "../lib/seasons";
import { formatStat } from "./Leaders";

const A = "var(--color-series-1)";
const B = "var(--color-series-2)";
const TREND_STATS: StatKey[] = ["pts", "reb", "ast", "stl", "blk", "min", "ts_pct", "fg3_pct", "fg_pct"];
const PAIRED = ["Points", "Rebounds", "Assists", "Steals", "Blocks"];

interface Data {
  manifest: Manifest;
  trends: LeagueSeasonRecord[];
  players: PlayerSeasonRecord[];
  careers: CareerRecord[];
  franchises: FranchiseRecord[];
}

export default function Compare() {
  const manifest = useArtifact("manifest");
  const trends = useArtifact("league-trends");
  const players = useArtifact("player-seasons");
  const careers = useArtifact("careers");
  const franchises = useArtifact("franchises");
  for (const a of [manifest, trends, players, careers, franchises]) {
    if (a.status === "error") return <ErrorState error={a.error} retry={a.retry} />;
  }
  if (manifest.status !== "ready" || trends.status !== "ready" || players.status !== "ready" || careers.status !== "ready" || franchises.status !== "ready") {
    return <LoadingState blocks={[110, 110, 120, 110, 480, 380]} />;
  }
  return <CompareView manifest={manifest.data} trends={trends.data} players={players.data} careers={careers.data} franchises={franchises.data} />;
}

/**
 * Default pair when the URL names none: the latest season's two top scorers
 * (at least half the season played). Derived from the data, so it stays
 * sensible after every refresh.
 */
function defaultPair(players: PlayerSeasonRecord[], trends: LeagueSeasonRecord[], latest: number, exclude?: number): number[] {
  const g = trends.find((t) => t.season === latest)?.games_per_team ?? 0;
  return players
    .filter((p) => p.season === latest && p.gp >= g / 2 && p.player_id !== exclude)
    .sort((a, b) => b.pts_pg - a.pts_pg)
    .slice(0, 2)
    .map((p) => p.player_id);
}

export function CompareView({ manifest, trends, players, careers, franchises }: Data) {
  const [params, setParams] = useSearchParams();
  const byId = useMemo(() => new Map(careers.map((c) => [c.player_id, c])), [careers]);
  const notes = useMemo(() => seasonNotes(trends, manifest), [trends, manifest]);
  const teamGames = useMemo(() => new Map(trends.map((t) => [t.season, t.games_per_team])), [trends]);

  const requestedA = byId.has(Number(params.get("a"))) ? Number(params.get("a")) : undefined;
  const fallback = defaultPair(players, trends, manifest.window.last, requestedA);
  const aId = requestedA ?? fallback[0]!;
  const bId = byId.has(Number(params.get("b"))) ? Number(params.get("b")) : (fallback.find((id) => id !== aId) ?? fallback[1]!);
  const a = byId.get(aId)!;
  const b = byId.get(bId)!;

  const rowsA = useMemo(() => players.filter((p) => p.player_id === aId), [players, aId]);
  const rowsB = useMemo(() => players.filter((p) => p.player_id === bId), [players, bId]);
  const shared = rowsA.map((r) => r.season).filter((s) => rowsB.some((r) => r.season === s)).sort((x, y) => y - x);

  const scope = params.get("scope") === "season" && shared.length > 0 ? "season" : "career";
  const season = shared.includes(Number(params.get("season"))) ? Number(params.get("season")) : shared[0];
  const stat = statByKey(TREND_STATS.includes(params.get("stat") as StatKey) ? params.get("stat")! : "pts");
  const basis: Basis = params.get("basis") === "per-36" && supportsPer36(stat) ? "per-36" : "per-game";

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  const pickA = (p: CareerRecord) => update({ a: String(p.player_id), b: String(bId === p.player_id ? aId : bId) });
  const pickB = (p: CareerRecord) => update({ b: String(p.player_id), a: String(aId === p.player_id ? bId : aId) });

  const seasonA = scope === "season" ? rowsA.find((r) => r.season === season) : undefined;
  const seasonB = scope === "season" ? rowsB.find((r) => r.season === season) : undefined;
  const sideA: PerGame = seasonA ?? a;
  const sideB: PerGame = seasonB ?? b;
  const table = headToHead(sideA, sideB);

  const scopeText = scope === "season" ? `${season} regular season, per game.` : `Career per game within the ${manifest.window.first} to ${manifest.window.last} window, regular season only.`;

  return (
    <>
      <title>{`${a.player_name} vs. ${b.player_name} · Court Vision`}</title>
      <PageHeader eyebrow="Player comparison" title="Compare" sub={scopeText} />

      <Card className="md:py-4">
        <div className="grid items-end gap-3 md:flex md:flex-wrap md:gap-4">
          <PlayerSearch careers={careers} label="Change player one" onPick={pickA} className="md:w-64" />
          <button
            type="button"
            aria-label="Swap players"
            onClick={() => update({ a: String(bId), b: String(aId) })}
            className="flex h-11 w-full items-center justify-center gap-2 rounded border border-field-line bg-field text-sm font-semibold text-ink md:h-10 md:w-10"
          >
            <svg width="18" height="18" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M3 6 H15 M11 2 L15 6 L11 10 M15 12 H3 M7 8 L3 12 L7 16" />
            </svg>
            <span className="md:sr-only">Swap</span>
          </button>
          <PlayerSearch careers={careers} label="Change player two" onPick={pickB} className="md:w-64" />
          <Segmented
            label="Scope"
            value={scope}
            options={[{ value: "career", label: "Career" }, { value: "season", label: "One season" }]}
            onChange={(v) => update({ scope: v === "career" ? null : v })}
            disabled={shared.length === 0}
            note="These two players never played in the same season."
          />
          {scope === "season" && season !== undefined ? (
            <Select label="Season" value={season} options={shared.map((s) => ({ value: s, label: String(s) }))} onChange={(v) => update({ season: String(v) })} className="md:w-28" />
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Who career={a} rows={rowsA} franchises={franchises} color={A} />
        <Who career={b} rows={rowsB} franchises={franchises} color={B} />
      </div>

      {aId === bId ? (
        <Card>
          <p className="m-0 text-[17px] text-ink">Pick two different players to compare.</p>
        </Card>
      ) : (
        <>
          <Sample a={a} b={b} seasonA={seasonA} seasonB={seasonB} season={season} scope={scope} teamGames={teamGames} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <HeadToHead table={table} a={a} b={b} />
            <Paired table={table} a={a} b={b} />
          </div>
          <Trend a={a} b={b} rowsA={rowsA} rowsB={rowsB} stat={stat} basis={basis} notes={notes} teamGames={teamGames} onStat={(v) => update({ stat: v === "pts" ? null : v })} onBasis={(v) => update({ basis: v === "per-game" ? null : v })} />
        </>
      )}
    </>
  );
}

const last = (name: string) => name.split(" ").slice(-1)[0] ?? name;

function Who({ career, rows, franchises, color }: { career: CareerRecord; rows: PlayerSeasonRecord[]; franchises: FranchiseRecord[]; color: string }) {
  const years = career.first_season === career.last_season ? String(career.first_season) : `${career.first_season} to ${career.last_season}`;
  return (
    <Card className="gap-1 md:py-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="inline-block size-3 shrink-0" style={{ background: color }} />
        <Link to={`/players/${career.player_id}`} className="font-display text-3xl font-extrabold uppercase leading-none text-ink hover:underline md:text-4xl">
          {career.player_name}
        </Link>
      </div>
      <p className="m-0 text-sm text-ink-2">
        {franchiseNames(rows, franchises).join(", ")} · {years} · {career.seasons_played} {career.seasons_played === 1 ? "season" : "seasons"}
      </p>
    </Card>
  );
}

function Sample({ a, b, seasonA, seasonB, season, scope, teamGames }: {
  a: CareerRecord;
  b: CareerRecord;
  seasonA?: PlayerSeasonRecord;
  seasonB?: PlayerSeasonRecord;
  season?: number;
  scope: "career" | "season";
  teamGames: Map<number, number | null>;
}) {
  const gpA = seasonA?.gp ?? a.gp;
  const gpB = seasonB?.gp ?? b.gp;
  const max = Math.max(gpA, gpB, 1);
  const g = season !== undefined ? teamGames.get(season) : null;

  let lead: string;
  let body: string;
  if (scope === "season" && season !== undefined) {
    const short = [seasonA, seasonB].filter((s) => s && g && s.gp < g / 2).map((s) => last(s!.player_name));
    lead = short.length ? "One side is a short season." : `${season}, same season.`;
    body =
      `${last(a.player_name)} played ${gpA} and ${last(b.player_name)} ${gpB}${g ? ` of ${Math.round(g)} games` : " games"}.` +
      (short.length ? ` ${short.join(" and ")} played under half the season, so those rates rest on a small sample.` : " Both played most of the season, so the numbers compare fairly.");
    if (short.length === 2) lead = "Both are short seasons.";
  } else {
    const s = sampleSentence({ name: a.player_name, gp: a.gp, seasons: a.seasons_played }, { name: b.player_name, gp: b.gp, seasons: b.seasons_played });
    lead = s.lead;
    body = s.body;
  }

  const bar = (name: string, gp: number, color: string) => (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-sm font-semibold text-ink md:w-28">{last(name)}</span>
      <span className="block flex-1">
        <span className="block h-3 rounded-r" style={{ width: `${(gp / max) * 100}%`, background: color }} />
      </span>
      <span className="tabular w-24 shrink-0 text-right font-display text-xl font-extrabold text-ink">{gp} games</span>
    </div>
  );

  return (
    <section aria-label="Sample size" className="flex flex-col gap-4 rounded border border-line border-t-4 border-t-rule bg-card p-4 md:flex-row md:items-center md:gap-10 md:px-6 md:py-5">
      <div className="flex flex-1 flex-col gap-2.5">
        {bar(a.player_name, gpA, A)}
        {bar(b.player_name, gpB, B)}
      </div>
      <p className="m-0 text-[15px] leading-normal text-ink md:w-[440px] md:text-base">
        <strong className="font-bold">{lead}</strong> {body}
      </p>
    </section>
  );
}

function HeadToHead({ table, a, b }: { table: ReturnType<typeof headToHead>; a: CareerRecord; b: CareerRecord }) {
  const fmt = (v: number | null, kind: "count" | "rate" | "ratio") => (v === null ? NA : kind === "rate" ? percent(v) : fixed(v, kind === "ratio" ? 2 : 1));
  const th = (align = "text-right") => `label-caps whitespace-nowrap border-b-2 border-rule px-3 py-2.5 ${align}`;
  const marker = (
    <svg width="10" height="10" aria-hidden="true" className="mr-1.5 inline-block fill-ink">
      <path d="M5 1 L9 8 L1 8 Z" />
    </svg>
  );
  const cell = (v: number | null, kind: "count" | "rate" | "ratio", win: boolean) => (
    <td className={`tabular whitespace-nowrap border-b border-line px-3 py-2.5 text-right text-[15px] ${win ? "font-bold text-ink" : "text-ink-2"}`}>
      {win ? marker : null}
      {win ? <span className="sr-only">Better: </span> : null}
      {v === null ? <span className="text-muted">{NA}</span> : fmt(v, kind)}
    </td>
  );
  return (
    <Card aria-labelledby="h2h-head" className="px-2 md:px-6">
      <div className="px-2 md:px-0">
        <CardHead id="h2h-head" title="Head to head" sub="Bold with a marker: the better value. Ties at the precision shown are marked even." />
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={th("text-left")}>Per game</th>
            <th scope="col" className={th()}>
              <span className="hidden md:inline">{a.player_name}</span>
              <span className="md:hidden">{last(a.player_name)}</span>
            </th>
            <th scope="col" className={th()}>
              <span className="hidden md:inline">{b.player_name}</span>
              <span className="md:hidden">{last(b.player_name)}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="border-b border-line px-3 py-2.5 text-left text-[15px] font-normal text-ink">
                {r.label}
                {r.better === "lower" ? <span className="ml-1.5 text-[13px] text-muted">lower is better</span> : null}
                {r.winner === "even" ? <span className="ml-1.5 text-[13px] text-muted">even</span> : null}
              </th>
              {cell(r.a, r.kind, r.winner === "a")}
              {cell(r.b, r.kind, r.winner === "b")}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Paired({ table, a, b }: { table: ReturnType<typeof headToHead>; a: CareerRecord; b: CareerRecord }) {
  const rows = table.filter((r) => PAIRED.includes(r.label));
  return (
    <Card aria-labelledby="paired-head" className="gap-5">
      <CardHead id="paired-head" title="Paired bars" sub="Each pair is scaled to its larger value." right={<Legend items={[{ color: A, label: last(a.player_name) }, { color: B, label: last(b.player_name) }]} />} />
      {rows.map((r) => {
        const max = Math.max(r.a ?? 0, r.b ?? 0) || 1;
        const bar = (v: number | null, color: string, who: string) => (
          <div className="flex items-center gap-2.5">
            <span className="sr-only">{who}</span>
            <span className="block flex-1">
              <span className="block h-3.5 rounded-r" style={{ width: `${((v ?? 0) / max) * 100}%`, background: color, minWidth: v ? 2 : 0 }} />
            </span>
            <span className="tabular w-10 text-right text-[15px] font-semibold text-ink">{v === null ? NA : v.toFixed(1)}</span>
          </div>
        );
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <span className="label-caps text-ink">{r.label}</span>
            {bar(r.a, A, a.player_name)}
            {bar(r.b, B, b.player_name)}
          </div>
        );
      })}
    </Card>
  );
}

function Trend({ a, b, rowsA, rowsB, stat, basis, notes, teamGames, onStat, onBasis }: {
  a: CareerRecord;
  b: CareerRecord;
  rowsA: PlayerSeasonRecord[];
  rowsB: PlayerSeasonRecord[];
  stat: ReturnType<typeof statByKey>;
  basis: Basis;
  notes: ReturnType<typeof seasonNotes>;
  teamGames: Map<number, number | null>;
  onStat: (v: StatKey) => void;
  onBasis: (v: Basis) => void;
}) {
  const first = Math.min(a.first_season, b.first_season);
  const lastSeason = Math.max(a.last_season, b.last_season);
  const x = Array.from({ length: lastSeason - first + 1 }, (_, i) => first + i);
  const scale = stat.kind === "rate" ? 100 : 1;
  const series = (rows: PlayerSeasonRecord[]) => {
    const by = new Map(rows.map((r) => [r.season, r]));
    const values = x.map((s) => {
      const r = by.get(s);
      const v = r ? stat.value(r, basis) : null;
      return v === null ? null : v * scale;
    });
    const hollow = x.map((s) => {
      const r = by.get(s);
      const g = teamGames.get(s);
      return !!r && !!g && r.gp < g / 2;
    });
    return { by, values, hollow };
  };
  const sa = series(rowsA);
  const sb = series(rowsB);
  const bands: ChartBand[] = x.flatMap((s) => {
    const n = notes.get(s);
    return n ? [{ from: s, to: s, label: n.short, tone: n.kind === "expansion" ? "expansion" : "band" } as ChartBand] : [];
  });
  const basisLabel = supportsPer36(stat) ? (basis === "per-36" ? " per 36" : " per game") : "";
  const hasShort = sa.hollow.some(Boolean) || sb.hollow.some(Boolean);

  return (
    <Card aria-labelledby="trend-head">
      <CardHead
        id="trend-head"
        title="Season by season"
        sub={`Open circle: under half of the team's games. A gap: that player did not play that season.`}
        right={
          <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto">
            <Select label="Stat" value={stat.key} options={TREND_STATS.map((k) => ({ value: k, label: statByKey(k).label }))} onChange={onStat} className="sm:w-48" />
            <Segmented label="Basis" value={basis} options={[{ value: "per-game", label: "Per game" }, { value: "per-36", label: "Per 36" }]} onChange={onBasis} disabled={!supportsPer36(stat)} note={`${stat.label} is not a per-minute stat.`} />
          </div>
        }
      />
      <Legend items={[{ color: A, label: a.player_name }, { color: B, label: b.player_name }, ...(hasShort ? [{ color: B, label: "Short season", hollow: true }] : [])]} />
      <LineChart
        x={x}
        height={360}
        label={`${stat.label}${basisLabel} by season for ${a.player_name} and ${b.player_name}.`}
        yFormat={(v) => (stat.kind === "rate" ? `${v}%` : String(v))}
        bands={bands}
        series={[
          { id: "a", label: a.player_name, color: A, values: sa.values, hollow: sa.hollow, endLabel: last(a.player_name) },
          { id: "b", label: b.player_name, color: B, values: sb.values, hollow: sb.hollow, endLabel: last(b.player_name) },
        ]}
        endLabelWidth={96}
        tooltip={(i) => {
          const s = x[i]!;
          const g = teamGames.get(s);
          const line = (name: string, color: string, r: PlayerSeasonRecord | undefined, v: number | null, short: boolean) =>
            r && v !== null
              ? { color, text: `${last(name)} ${formatStat(stat, v / scale)} · ${r.gp}${g ? ` of ${Math.round(g)}` : ""} games${short ? ", short" : ""}` }
              : { color, text: `${last(name)} did not play` };
          return {
            title: `${s}${notes.get(s) ? ` · ${notes.get(s)!.short}` : ""}`,
            rows: [line(a.player_name, A, sa.by.get(s), sa.values[i] ?? null, sa.hollow[i] ?? false), line(b.player_name, B, sb.by.get(s), sb.values[i] ?? null, sb.hollow[i] ?? false)],
          };
        }}
      />
    </Card>
  );
}
