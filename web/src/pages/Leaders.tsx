import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Legend } from "../components/charts/LineChart";
import { Scatter, type ScatterPoint } from "../components/charts/Scatter";
import { Badge, Value } from "../components/ui/Badge";
import { Card, CardHead } from "../components/ui/Card";
import { Segmented, Select } from "../components/ui/Controls";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../components/ui/States";
import type { FranchiseRecord, LeagueSeasonRecord, PlayerSeasonRecord } from "../data/contract";
import { useArtifact } from "../data/useArtifact";
import { downloadText, toCsv } from "../lib/csv";
import { fixed, percent } from "../lib/format";
import { franchisesIn, labelResolver } from "../lib/franchises";
import { defaultMinGames, rankLeaders, statByKey, STATS, supportsPer36, type Basis, type Leader, type StatDef } from "../lib/leaders";

const PAGE = 25;
const SCATTER_TOP = 15;
const S2 = "var(--color-series-2)";

export default function Leaders() {
  const trends = useArtifact("league-trends");
  const players = useArtifact("player-seasons");
  const franchises = useArtifact("franchises");
  for (const a of [trends, players, franchises]) {
    if (a.status === "error") return <ErrorState error={a.error} retry={a.retry} />;
  }
  if (trends.status !== "ready" || players.status !== "ready" || franchises.status !== "ready") {
    return <LoadingState blocks={[110, 90, 640, 420]} />;
  }
  return <LeadersView trends={trends.data} players={players.data} franchises={franchises.data} />;
}

/** Display a stat value the way its kind reads best: 26.0, 62.0%, 1.66. */
export function formatStat(stat: StatDef, v: number | null): string {
  if (stat.kind === "rate") return percent(v);
  return fixed(v, stat.kind === "ratio" ? 2 : 1);
}

export function LeadersView({ trends, players, franchises }: { trends: LeagueSeasonRecord[]; players: PlayerSeasonRecord[]; franchises: FranchiseRecord[] }) {
  const [params, setParams] = useSearchParams();
  const seasons = useMemo(() => [...new Set(players.map((p) => p.season))].sort((a, b) => b - a), [players]);
  const latest = seasons[0] ?? 0;
  const season = seasons.includes(Number(params.get("season"))) ? Number(params.get("season")) : latest;
  const league = trends.find((t) => t.season === season);
  const teamGames = league?.games_per_team ?? null;

  const stat = statByKey(params.get("stat") ?? "pts");
  const basis: Basis = params.get("basis") === "per-36" && supportsPer36(stat) ? "per-36" : "per-game";
  const fallbackMin = defaultMinGames(teamGames);
  const minGames = Math.max(1, Number(params.get("min")) || fallbackMin);
  const teams = useMemo(() => franchisesIn(franchises, season), [franchises, season]);
  const franchise = teams.some((t) => t.slug === params.get("team")) ? params.get("team") : null;
  const resolve = useMemo(() => labelResolver(franchises), [franchises]);

  const leaders = useMemo(
    () => rankLeaders(players, { season, stat, basis, minGames, franchise, resolve }),
    [players, season, stat, basis, minGames, franchise, resolve],
  );
  const pages = Math.max(1, Math.ceil(leaders.length / PAGE));
  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), pages);
  const shown = leaders.slice((page - 1) * PAGE, page * PAGE);

  const update = (next: Record<string, string | null>, resetPage = true) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    if (resetPage) p.delete("page");
    setParams(p, { replace: true });
  };

  const teamName = teams.find((t) => t.slug === franchise)?.name;
  const basisText = supportsPer36(stat) ? (basis === "per-36" ? "per 36 minutes" : "per game") : "";
  const sub = [
    `${season} regular season`,
    `${stat.label.toLowerCase()}${basisText ? ` ${basisText}` : ""}`,
    `minimum ${minGames} ${minGames === 1 ? "game" : "games"}`,
    teamName,
    `${leaders.length} qualify`,
  ]
    .filter(Boolean)
    .join(" · ");

  const minOptions = [...new Set([1, 5, 10, 15, fallbackMin, 20, 25, 30, 35, 40, minGames])]
    .filter((n) => teamGames === null || n <= Math.ceil(teamGames))
    .sort((a, b) => a - b)
    .map((n) => ({ value: n, label: n === fallbackMin ? `${n} (half)` : String(n) }));

  return (
    <>
      <title>{`${season} ${stat.label} leaders · Court Vision`}</title>
      <PageHeader eyebrow="Leaderboard" title="Leaders" sub={sub} />

      <Card className="md:py-4">
        <div className="grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap md:gap-4">
          <Select label="Season" value={season} options={seasons.map((s) => ({ value: s, label: String(s) }))} onChange={(v) => update({ season: v === latest ? null : String(v), team: null, min: null })} className="md:w-28" />
          <Select label="Rank by" value={stat.key} options={STATS.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => update({ stat: v === "pts" ? null : v })} className="md:w-48" />
          <div className="col-span-2 md:col-span-1">
            <Segmented
              label="Basis"
              value={basis}
              options={[{ value: "per-game", label: "Per game" }, { value: "per-36", label: "Per 36" }]}
              onChange={(v) => update({ basis: v === "per-game" ? null : v })}
              disabled={!supportsPer36(stat)}
              note={`${stat.label} is not a per-minute stat.`}
            />
          </div>
          <Select label="Team" value={franchise ?? ""} options={[{ value: "", label: "All teams" }, ...teams.map((t) => ({ value: t.slug, label: t.name }))]} onChange={(v) => update({ team: v || null })} className="md:w-52" />
          <Select label="Minimum games" value={minGames} options={minOptions} onChange={(v) => update({ min: v === fallbackMin ? null : String(v) })} className="md:w-48" />
          {params.toString() ? (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="col-span-2 h-11 text-left text-sm font-semibold text-ink underline md:ml-auto md:h-10">
              Reset filters
            </button>
          ) : null}
        </div>
      </Card>

      {leaders.length === 0 ? (
        <Card>
          <p className="m-0 text-[17px] text-ink">No players match these filters. Try a lower minimum or all teams.</p>
        </Card>
      ) : (
        <>
          <LeaderTable
            leaders={shown}
            all={leaders}
            stat={stat}
            basis={basis}
            season={season}
            teamGames={teamGames}
            page={page}
            pages={pages}
            onPage={(p) => update({ page: p === 1 ? null : String(p) }, false)}
            onRank={(key) => update({ stat: key === "pts" ? null : key })}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <VolumeVsEfficiency leaders={leaders.slice(0, SCATTER_TOP)} stat={stat} basis={basis} teamGames={teamGames} leagueTs={league?.ts_pct ?? null} />
            <Card>
              <CardHead title="Reading this table" />
              <Notes stat={stat} minGames={minGames} teamGames={teamGames} />
            </Card>
          </div>
        </>
      )}
    </>
  );
}

/** Columns shown beside the ranked stat, so volume and efficiency read together. */
function companions(stat: StatDef): StatDef[] {
  const base = ["pts", "reb", "ast", "ts_pct"].map(statByKey);
  if (stat.kind === "count") return base.filter((s) => s.key !== stat.key);
  return base.filter((s) => s.key !== stat.key && s.key !== "reb");
}

function gamesText(gp: number, teamGames: number | null) {
  return teamGames !== null && gp < teamGames / 2 ? `${gp} of ${Math.round(teamGames)}` : String(gp);
}

function LeaderTable({ leaders, all, stat, basis, season, teamGames, page, pages, onPage, onRank }: {
  leaders: Leader[];
  all: Leader[];
  stat: StatDef;
  basis: Basis;
  season: number;
  teamGames: number | null;
  page: number;
  pages: number;
  onPage: (p: number) => void;
  onRank: (key: StatDef["key"]) => void;
}) {
  const others = companions(stat);
  const top = all[0]?.value ?? 1;
  const th = (align = "text-right") => `label-caps whitespace-nowrap border-b-2 border-rule px-3 py-2.5 ${align}`;
  const td = (align = "text-right") => `tabular whitespace-nowrap border-b border-line px-3 py-2.5 text-[15px] text-ink ${align}`;
  const from = (page - 1) * PAGE + 1;

  const download = () =>
    downloadText(
      `court-vision-${season}-${stat.key}-${basis}.csv`,
      toCsv(
        ["rank", "player", "teams", "gp", "min_pg", `${stat.key}${stat.kind === "count" ? `_${basis}` : ""}`, "pts_pg", "reb_pg", "ast_pg", "ts_pct"],
        all.map((l) => [l.rank, l.row.player_name, l.row.teams.join(" "), l.row.gp, l.row.min_pg, l.value, l.row.pts_pg, l.row.reb_pg, l.row.ast_pg, l.row.ts_pct]),
      ),
    );

  const rankHeader = (s: StatDef, ranked: boolean) => (
    <th key={s.key} scope="col" aria-sort={ranked ? "descending" : undefined} className={`${th()} ${ranked ? "bg-highlight text-ink" : ""}`}>
      {ranked ? (
        <span>{s.short} ▼</span>
      ) : (
        <button type="button" onClick={() => onRank(s.key)} className="label-caps underline decoration-dotted underline-offset-4 hover:text-ink" title={`Rank by ${s.label.toLowerCase()}`}>
          {s.short}
        </button>
      )}
    </th>
  );

  const pager = (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-2">
      <span>
        Showing {from} to {from + leaders.length - 1} of {all.length}
      </span>
      {pages > 1 ? (
        <div className="flex gap-2">
          <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className="h-11 rounded border border-field-line bg-field px-4 font-semibold text-ink disabled:text-muted md:h-10">
            Previous
          </button>
          <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} className="h-11 rounded border border-field-line bg-field px-4 font-semibold text-ink disabled:text-muted md:h-10">
            Next
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <Card aria-labelledby="leader-table" className="px-3 md:px-6">
      <div className="px-1 md:px-0">
        <CardHead
          id="leader-table"
          title={`${stat.label}, ${season}`}
          sub={stat.kind === "count" ? "True shooting sits beside scoring so volume and efficiency read together. Select a column to rank by it." : "The attempts column shows the sample behind each percentage."}
          right={
            <button type="button" onClick={download} className="text-sm font-semibold text-ink underline">
              Download CSV
            </button>
          }
        />
      </div>

      {/* Phone: a ranked list. */}
      <ol className="m-0 list-none p-0 md:hidden">
        {leaders.map((l) => (
          <li key={l.row.player_id}>
            <Link to={`/players/${l.row.player_id}`} className="flex min-h-[60px] items-center gap-3 border-b border-line px-1 py-2">
              <span className="w-7 text-right font-display text-[22px] font-extrabold text-ink-2">{l.rank}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-bold text-ink">{l.row.player_name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                  {l.row.teams.join(", ")} · {gamesText(l.row.gp, teamGames)} GP {l.row.is_multi_team ? <Badge>Traded</Badge> : null}
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="tabular font-display text-[26px] font-extrabold leading-none text-ink">{formatStat(stat, l.value)}</span>
                <span className="tabular text-[13px] text-ink-2">
                  {stat.key === "ts_pct" ? `${fixed(l.row.pts_pg)} PTS` : <><Value text={percent(l.row.ts_pct)} /> TS</>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {/* Tablet and up: the full table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={th()}>#</th>
              <th scope="col" className={th("text-left")}>Player</th>
              <th scope="col" className={th("text-left")}>Team</th>
              <th scope="col" className={th()}>GP</th>
              <th scope="col" className={th()}>MIN</th>
              {rankHeader(stat, true)}
              {stat.volume ? <th scope="col" className={th()}>{stat.volume.short}/G</th> : null}
              {others.map((s) => rankHeader(s, false))}
            </tr>
          </thead>
          <tbody>
            {leaders.map((l) => (
              <tr key={l.row.player_id}>
                <td className={`${td()} w-8 font-display text-lg font-bold text-ink-2`}>{l.rank}</td>
                <td className={td("text-left")}>
                  <Link to={`/players/${l.row.player_id}`} className="font-bold hover:underline">
                    {l.row.player_name}
                  </Link>
                  {l.row.is_multi_team ? <span className="ml-2"><Badge title="Played for more than one team this season. Stats are season totals.">Traded</Badge></span> : null}
                </td>
                <td className={td("text-left")}>{l.row.teams.join(", ")}</td>
                <td className={td()}>
                  {teamGames !== null && l.row.gp < teamGames / 2 ? (
                    <>
                      {l.row.gp} <span className="text-muted">of {Math.round(teamGames)}</span>
                    </>
                  ) : (
                    l.row.gp
                  )}
                </td>
                <td className={td()}>{fixed(l.row.min_pg)}</td>
                <td className={`${td()} bg-highlight`}>
                  <span className="inline-flex items-center justify-end gap-2.5">
                    <span aria-hidden="true" className="inline-block h-2 rounded-r bg-accent" style={{ width: `${Math.max((l.value / (top || 1)) * 90, 2)}px` }} />
                    <span className="min-w-12 font-bold">{formatStat(stat, l.value)}</span>
                  </span>
                </td>
                {stat.volume ? <td className={td()}>{fixed(stat.volume.value(l.row))}</td> : null}
                {others.map((s) => (
                  <td key={s.key} className={td()}>
                    <Value text={formatStat(s, s.value(l.row, basis))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager}
    </Card>
  );
}

function VolumeVsEfficiency({ leaders, stat, basis, teamGames, leagueTs }: { leaders: Leader[]; stat: StatDef; basis: Basis; teamGames: number | null; leagueTs: number | null }) {
  // x is the ranked stat when it is a volume stat; for rates, scoring volume.
  const xStat = stat.kind === "count" ? stat : statByKey("pts");
  const xBasis = stat.kind === "count" ? basis : "per-game";
  const points: ScatterPoint[] = leaders.flatMap((l) => {
    const x = xStat.value(l.row, xBasis);
    const y = l.row.ts_pct;
    return x === null || y === null ? [] : [{ id: l.row.player_id, x, y: y * 100, label: l.row.player_name.split(" ").slice(-1)[0] ?? "", hollow: teamGames !== null && l.row.gp < teamGames / 2 }];
  });
  if (points.length < 3) return null;

  const byY = [...points].sort((a, b) => b.y - a.y);
  const labelled = new Set([points[0]?.id, points[1]?.id, points[2]?.id, byY[0]?.id, byY.at(-1)?.id].filter((v): v is number => v !== undefined));
  const rows = new Map(leaders.map((l) => [l.row.player_id, l]));
  const xName = `${xStat.label}${xStat.kind === "count" && xStat.key !== "min" ? (xBasis === "per-36" ? " per 36" : " per game") : " per game"}`;

  return (
    <Card aria-labelledby="scatter-head">
      <CardHead
        id="scatter-head"
        title="Volume vs. efficiency"
        sub={`The top ${points.length}. Up and to the right is both.`}
        right={<Legend items={[{ color: S2, label: "Played half the season or more" }, { color: S2, label: "Fewer games", hollow: true }]} />}
      />
      <Scatter
        points={points}
        height={360}
        label={`${xName} against true shooting for the top ${points.length}.`}
        xLabel={xName}
        xFormat={(v) => String(v)}
        yFormat={(v) => `${v}%`}
        labelled={labelled}
        reference={leagueTs !== null ? { y: leagueTs * 100, label: `League ${percent(leagueTs)} TS` } : undefined}
        tooltip={(p) => {
          const l = rows.get(Number(p.id))!;
          return {
            title: `${l.row.player_name} · ${l.row.teams.join(", ")}`,
            rows: [
              { text: `${l.row.gp}${teamGames ? ` of ${Math.round(teamGames)}` : ""} games${l.row.is_multi_team ? ", traded" : ""}` },
              { text: `${formatStat(xStat, p.x)} ${xName.toLowerCase()}` },
              { text: `${percent(l.row.ts_pct)} true shooting` },
            ],
          };
        }}
      />
    </Card>
  );
}

function Notes({ stat, minGames, teamGames }: { stat: StatDef; minGames: number; teamGames: number | null }) {
  const lines = [
    `Players need at least ${minGames} ${minGames === 1 ? "game" : "games"}${teamGames ? ` of the ${Math.round(teamGames)}-game season` : ""} to qualify.`,
    stat.qualifier ? `${stat.label} also requires ${stat.qualifier.text}.` : null,
    "Traded players list every team they played for, in the order they played for them. Their stats are season totals across those teams.",
    "Team labels are the ones used that season, so Phoenix reads PHO through 2024 and PHX from 2025. The team filter groups by franchise.",
    "Rates with no attempts show n/a, never zero.",
  ].filter((l): l is string => l !== null);
  return (
    <div className="flex flex-col gap-3">
      {lines.map((l) => (
        <p key={l} className="m-0 text-[15px] leading-normal text-ink">
          {l}
        </p>
      ))}
    </div>
  );
}
