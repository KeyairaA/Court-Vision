import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { LineChart, Legend, type ChartBand } from "../components/charts/LineChart";
import { Badge, Value } from "../components/ui/Badge";
import { Card, CardHead } from "../components/ui/Card";
import { Segmented, Select } from "../components/ui/Controls";
import { Kpi } from "../components/ui/Kpi";
import { PageHeader } from "../components/ui/PageHeader";
import { PlayerSearch } from "../components/ui/PlayerSearch";
import { ErrorState, LoadingState } from "../components/ui/States";
import type { CareerRecord, FranchiseRecord, LeagueSeasonRecord, Manifest, PlayerSeasonRecord } from "../data/contract";
import { useArtifact } from "../data/useArtifact";
import { downloadText, toCsv } from "../lib/csv";
import { fixed, percent } from "../lib/format";
import { statByKey, supportsPer36, type Basis, type StatKey } from "../lib/leaders";
import { franchiseNames, seasonSlots, type SeasonSlot } from "../lib/players";
import { seasonNotes } from "../lib/seasons";
import { formatStat } from "./Leaders";

const S1 = "var(--color-series-1)";
const TREND_STATS: StatKey[] = ["pts", "reb", "ast", "stl", "blk", "min", "ts_pct", "fg3_pct", "fg_pct"];

function useProfileData() {
  const manifest = useArtifact("manifest");
  const trends = useArtifact("league-trends");
  const players = useArtifact("player-seasons");
  const careers = useArtifact("careers");
  const franchises = useArtifact("franchises");
  return { manifest, trends, players, careers, franchises };
}

/** /players and /players/:playerId. */
export default function Players() {
  const { playerId } = useParams();
  const d = useProfileData();
  for (const a of Object.values(d)) {
    if (a.status === "error") return <ErrorState error={a.error} retry={a.retry} />;
  }
  if (d.manifest.status !== "ready" || d.trends.status !== "ready" || d.players.status !== "ready" || d.careers.status !== "ready" || d.franchises.status !== "ready") {
    return <LoadingState blocks={[140, 130, 420, 560]} />;
  }
  const props = { manifest: d.manifest.data, trends: d.trends.data, players: d.players.data, careers: d.careers.data, franchises: d.franchises.data };
  if (playerId === undefined) return <PlayersIndex {...props} />;
  return <PlayerProfile {...props} playerId={Number(playerId)} />;
}

interface Data {
  manifest: Manifest;
  trends: LeagueSeasonRecord[];
  players: PlayerSeasonRecord[];
  careers: CareerRecord[];
  franchises: FranchiseRecord[];
}

// ------------------------------------------------------------------ index --

export function PlayersIndex({ manifest, players, careers }: Data) {
  const latest = manifest.window.last;
  const active = useMemo(
    () => players.filter((p) => p.season === latest && p.gp >= 10).sort((a, b) => b.pts_pg - a.pts_pg).slice(0, 24),
    [players, latest],
  );
  return (
    <>
      <title>Players · Court Vision</title>
      <PageHeader eyebrow="Player profiles" title="Players" sub={`Every player who appeared from ${manifest.window.first} to ${manifest.window.last}: ${careers.length} in all.`} />
      <Card>
        <PlayerSearch careers={careers} label="Search players" className="max-w-md" />
      </Card>
      <Card aria-labelledby="top-scorers">
        <CardHead id="top-scorers" title={`${latest} top scorers`} sub="A place to start. At least 10 games played." />
        <ul className="m-0 grid list-none gap-x-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => (
            <li key={p.player_id}>
              <Link to={`/players/${p.player_id}`} className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 hover:underline">
                <span className="font-semibold text-ink">{p.player_name}</span>
                <span className="tabular text-sm text-ink-2">
                  {p.teams.join(", ")} · {fixed(p.pts_pg)} PTS
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- profile --

export function PlayerProfile({ manifest, trends, players, careers, franchises, playerId }: Data & { playerId: number }) {
  const [params, setParams] = useSearchParams();
  const career = careers.find((c) => c.player_id === playerId);
  const slots = useMemo(() => seasonSlots(players, playerId), [players, playerId]);
  const notes = useMemo(() => seasonNotes(trends, manifest), [trends, manifest]);
  const teamGames = useMemo(() => new Map(trends.map((t) => [t.season, t.games_per_team])), [trends]);

  if (!career || slots.length === 0) {
    return (
      <>
        <title>Player not found · Court Vision</title>
        <PageHeader eyebrow="Player profile" title="No such player" />
        <Card>
          <p className="m-0 text-[17px] text-ink">
            There is no player with that ID in {manifest.window.first} to {manifest.window.last}.
          </p>
          <PlayerSearch careers={careers} className="max-w-md" />
        </Card>
      </>
    );
  }

  const played = slots.flatMap((s) => (s.row ? [s.row] : []));
  const latest = played.at(-1)!;
  const names = franchiseNames(played, franchises);
  const oneFranchise = names.length === 1 && played.length > 1;
  const seasonsText = career.first_season === career.last_season ? String(career.first_season) : `${career.first_season} to ${career.last_season}`;

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

  const isShort = (s: SeasonSlot) => {
    const g = teamGames.get(s.season);
    return s.row !== null && g !== null && g !== undefined && s.row.gp < g / 2;
  };

  return (
    <>
      <title>{`${career.player_name} · Court Vision`}</title>
      <PageHeader
        eyebrow="Player profile"
        title={career.player_name}
        sub={`${names.join(", ")} · ${seasonsText}${oneFranchise ? " · every season with one franchise" : ""}`}
        controls={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <PlayerSearch careers={careers} className="sm:w-60" />
            <Link
              to={`/compare?a=${playerId}`}
              className="flex h-11 items-center justify-center rounded bg-ink px-5 font-display text-base font-bold uppercase tracking-[0.06em] text-card md:h-10"
            >
              Compare
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        <Kpi label="Games" value={String(career.gp)} delta={`${career.seasons_played} ${career.seasons_played === 1 ? "season" : "seasons"}, ${seasonsText}`} />
        <Kpi label="Points" value={fixed(career.pts_pg)} delta={`${latest.season}: ${fixed(latest.pts_pg)}`} />
        <Kpi label="Rebounds" value={fixed(career.reb_pg)} delta={`${latest.season}: ${fixed(latest.reb_pg)}`} />
        <Kpi label="Assists" value={fixed(career.ast_pg)} delta={`${latest.season}: ${fixed(latest.ast_pg)}`} />
        <Kpi label="Blocks" value={fixed(career.blk_pg)} delta={`${latest.season}: ${fixed(latest.blk_pg)}`} />
        <Kpi label="True shooting" value={percent(career.ts_pct)} delta={`${latest.season}: ${percent(latest.ts_pct)}`} />
      </div>

      <TrendCard slots={slots} stat={stat} basis={basis} isShort={isShort} teamGames={teamGames} notes={notes} onStat={(v) => update({ stat: v === "pts" ? null : v })} onBasis={(v) => update({ basis: v === "per-game" ? null : v })} />

      <SeasonTable slots={slots} career={career} isShort={isShort} teamGames={teamGames} notes={notes} windowFirst={manifest.window.first} />

      <Link to="/how-it-works" className="flex min-h-11 items-center justify-between gap-4 rounded bg-chrome px-5 py-4 text-chrome-ink">
        <span className="flex flex-col gap-1">
          <span className="font-display text-xl font-extrabold uppercase tracking-[0.04em]">How these numbers are calculated</span>
          <span className="text-sm text-chrome-ink-2">True shooting, games-weighted career totals, and what the window leaves out.</span>
        </span>
        <svg width="24" height="24" aria-hidden="true" className="shrink-0" style={{ fill: "none", stroke: "var(--color-accent)", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" }}>
          <path d="M5 12 H19 M13 6 L19 12 L13 18" />
        </svg>
      </Link>
    </>
  );
}

function TrendCard({ slots, stat, basis, isShort, teamGames, notes, onStat, onBasis }: {
  slots: SeasonSlot[];
  stat: ReturnType<typeof statByKey>;
  basis: Basis;
  isShort: (s: SeasonSlot) => boolean;
  teamGames: Map<number, number | null>;
  notes: ReturnType<typeof seasonNotes>;
  onStat: (v: StatKey) => void;
  onBasis: (v: Basis) => void;
}) {
  const scale = stat.kind === "rate" ? 100 : 1;
  const values = slots.map((s) => {
    const v = s.row ? stat.value(s.row, basis) : null;
    return v === null ? null : v * scale;
  });
  const real = values.filter((v): v is number => v !== null);
  const high = real.length > 1 ? Math.max(...real) : null;
  const hollow = slots.map(isShort);
  const x = slots.map((s) => s.season);
  const bands: ChartBand[] = slots.flatMap((s) => {
    const n = notes.get(s.season);
    return n ? [{ from: s.season, to: s.season, label: n.short, tone: n.kind === "expansion" ? "expansion" : "band" } as ChartBand] : [];
  });
  const shortCount = hollow.filter(Boolean).length;
  const missed = slots.filter((s) => !s.row).map((s) => s.season);
  const basisLabel = supportsPer36(stat) ? (basis === "per-36" ? " per 36" : " per game") : "";
  const last = values.at(-1);

  const sub = [
    shortCount ? `Open circles: ${shortCount === 1 ? "a season" : "seasons"} with under half of the team's games.` : "No short seasons: every season covers at least half of the team's games.",
    missed.length ? `Missed ${missed.join(", ")}, so the line breaks there.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (real.length === 0) return null;

  return (
    <Card aria-labelledby="trend-head">
      <CardHead
        id="trend-head"
        title="Season by season"
        sub={sub}
        right={
          <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto">
            <Select label="Stat" value={stat.key} options={TREND_STATS.map((k) => ({ value: k, label: statByKey(k).label }))} onChange={onStat} className="sm:w-48" />
            <Segmented label="Basis" value={basis} options={[{ value: "per-game", label: "Per game" }, { value: "per-36", label: "Per 36" }]} onChange={onBasis} disabled={!supportsPer36(stat)} note={`${stat.label} is not a per-minute stat.`} />
          </div>
        }
      />
      {shortCount ? <Legend items={[{ color: S1, label: stat.label + basisLabel }, { color: S1, label: "Short season", hollow: true }]} /> : null}
      <LineChart
        x={x}
        height={340}
        label={`${stat.label}${basisLabel} by season, ${x[0]} to ${x.at(-1)}.`}
        yFormat={(v) => (stat.kind === "rate" ? `${v}%` : String(v))}
        bands={bands}
        series={[{ id: stat.key, label: stat.label, color: S1, values, hollow, endLabel: last === null || last === undefined ? undefined : formatStat(stat, last / scale) }]}
        endLabelWidth={62}
        tooltip={(i) => {
          const s = slots[i]!;
          if (!s.row) return { title: String(s.season), rows: [{ text: "Did not play" }] };
          const v = values[i]!;
          const g = teamGames.get(s.season);
          return {
            title: `${s.season} · ${s.row.teams.join(", ")}`,
            rows: [
              { color: S1, text: `${formatStat(stat, v / scale)} ${stat.label.toLowerCase()}${basisLabel}` },
              { text: `${s.row.gp}${g ? ` of ${Math.round(g)}` : ""} games played` },
              ...(isShort(s) ? [{ text: "Short season" }] : []),
              ...(v === high ? [{ text: "Window high" }] : []),
              ...(notes.get(s.season) ? [{ text: notes.get(s.season)!.detail }] : []),
            ],
          };
        }}
      />
    </Card>
  );
}

function SeasonTable({ slots, career, isShort, teamGames, notes, windowFirst }: {
  slots: SeasonSlot[];
  career: CareerRecord;
  isShort: (s: SeasonSlot) => boolean;
  teamGames: Map<number, number | null>;
  notes: ReturnType<typeof seasonNotes>;
  windowFirst: number;
}) {
  const th = (align = "text-right", extra = "") => `label-caps whitespace-nowrap border-b-2 border-rule px-3 py-2.5 ${align} ${extra}`;
  const td = (align = "text-right", extra = "") => `tabular whitespace-nowrap border-b border-line px-3 py-2.5 text-[15px] text-ink ${align} ${extra}`;
  const wide = "hidden md:table-cell";
  const newestFirst = [...slots].reverse();
  const hasShort = slots.some(isShort);

  const download = () =>
    downloadText(
      `court-vision-${career.player_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
      toCsv(
        ["season", "teams", "gp", "min_pg", "pts_pg", "reb_pg", "ast_pg", "stl_pg", "blk_pg", "fg_pct", "fg3_pct", "ft_pct", "ts_pct"],
        slots.flatMap((s) => (s.row ? [[s.season, s.row.teams.join(" "), s.row.gp, s.row.min_pg, s.row.pts_pg, s.row.reb_pg, s.row.ast_pg, s.row.stl_pg, s.row.blk_pg, s.row.fg_pct, s.row.fg3_pct, s.row.ft_pct, s.row.ts_pct]] : [])),
      ),
    );

  return (
    <Card aria-labelledby="seasons-head" className="px-2 md:px-6">
      <div className="px-2 md:px-0">
        <CardHead
          id="seasons-head"
          title="All seasons"
          sub="Regular season, per game, newest first."
          right={
            <button type="button" onClick={download} className="text-sm font-semibold text-ink underline">
              Download CSV
            </button>
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={th("text-left")}>Season</th>
              <th scope="col" className={th("text-left", wide)}>Team</th>
              <th scope="col" className={th()}>GP</th>
              <th scope="col" className={th("text-right", wide)}>MIN</th>
              <th scope="col" className={th()}>PTS</th>
              <th scope="col" className={th()}>REB</th>
              <th scope="col" className={th()}>AST</th>
              <th scope="col" className={th("text-right", wide)}>STL</th>
              <th scope="col" className={th("text-right", wide)}>BLK</th>
              <th scope="col" className={th("text-right", wide)}>FG%</th>
              <th scope="col" className={th("text-right", wide)}>3P%</th>
              <th scope="col" className={th("text-right", wide)}>FT%</th>
              <th scope="col" className={th()}>TS%</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((s) => {
              const seasonCell = (
                <th scope="row" className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-display text-[17px] font-bold text-ink">
                  {s.season}
                  {notes.get(s.season) ? <span className="text-accent-ink" title={notes.get(s.season)!.detail}> *</span> : null}
                </th>
              );
              if (!s.row) {
                return (
                  <tr key={s.season}>
                    {seasonCell}
                    <td colSpan={12} className="border-b border-line px-3 py-2.5 text-[15px] text-muted">
                      Did not play
                    </td>
                  </tr>
                );
              }
              const r = s.row;
              const g = teamGames.get(s.season);
              return (
                <tr key={s.season}>
                  {seasonCell}
                  <td className={td("text-left", wide)}>
                    {r.teams.join(", ")}
                    {r.is_multi_team ? <span className="ml-2"><Badge>Traded</Badge></span> : null}
                  </td>
                  <td className={td()}>
                    {r.gp}
                    {g ? <span className={`text-muted ${isShort(s) ? "inline" : "hidden md:inline"}`}> / {Math.round(g)}</span> : null}
                  </td>
                  <td className={td("text-right", wide)}>{fixed(r.min_pg)}</td>
                  <td className={td()}>{fixed(r.pts_pg)}</td>
                  <td className={td()}>{fixed(r.reb_pg)}</td>
                  <td className={td()}>{fixed(r.ast_pg)}</td>
                  <td className={td("text-right", wide)}>{fixed(r.stl_pg)}</td>
                  <td className={td("text-right", wide)}>{fixed(r.blk_pg)}</td>
                  <td className={td("text-right", wide)}><Value text={percent(r.fg_pct)} /></td>
                  <td className={td("text-right", wide)}><Value text={percent(r.fg3_pct)} /></td>
                  <td className={td("text-right", wide)}><Value text={percent(r.ft_pct)} /></td>
                  <td className={td()}><Value text={percent(r.ts_pct)} /></td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="whitespace-nowrap border-t-2 border-rule px-3 py-2.5 text-left font-display text-[17px] font-bold text-ink">Career</th>
              <td className={td("text-left", `${wide} border-t-2 border-t-rule`)} />
              <td className={td("text-right", "border-t-2 border-t-rule font-bold")}>{career.gp}</td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}>{fixed(career.min_pg)}</td>
              <td className={td("text-right", "border-t-2 border-t-rule font-bold")}>{fixed(career.pts_pg)}</td>
              <td className={td("text-right", "border-t-2 border-t-rule font-bold")}>{fixed(career.reb_pg)}</td>
              <td className={td("text-right", "border-t-2 border-t-rule font-bold")}>{fixed(career.ast_pg)}</td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}>{fixed(career.stl_pg)}</td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}>{fixed(career.blk_pg)}</td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}><Value text={percent(career.fg_pct)} /></td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}><Value text={percent(career.fg3_pct)} /></td>
              <td className={td("text-right", `${wide} border-t-2 border-t-rule font-bold`)}><Value text={percent(career.ft_pct)} /></td>
              <td className={td("text-right", "border-t-2 border-t-rule font-bold")}><Value text={percent(career.ts_pct)} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="m-0 px-2 text-sm leading-normal text-ink-2 md:px-0">
        n/a means no attempts that season; 0.0% means attempts with no makes. * marks a caveat season.
        {hasShort ? " GP shows the team's games too when a season is short." : ""} Career numbers are games-weighted totals within the window
        {career.first_season === windowFirst ? `, which starts in ${windowFirst}, so any earlier seasons are not included.` : "."}
        <span className="md:hidden"> Turn the phone sideways or use a wider screen for every column.</span>
      </p>
    </Card>
  );
}
