import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { LineChart, Legend, type ChartBand, type TooltipContent } from "../components/charts/LineChart";
import { Badge, Value } from "../components/ui/Badge";
import { Card, CardHead } from "../components/ui/Card";
import { Checkbox, Select } from "../components/ui/Controls";
import { Kpi } from "../components/ui/Kpi";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../components/ui/States";
import type { LeagueSeasonRecord, Manifest } from "../data/contract";
import { useArtifact } from "../data/useArtifact";
import { downloadText, toCsv } from "../lib/csv";
import { fixed, gamesPerTeam, percent, signed } from "../lib/format";
import { seasonNotes, type SeasonNote } from "../lib/seasons";
import { takeaways } from "./trends-copy";

const S1 = "var(--color-series-1)";
const S2 = "var(--color-series-2)";
const asPct = (v: number | null) => (v === null ? null : v * 100);

export default function Trends() {
  const manifest = useArtifact("manifest");
  const trends = useArtifact("league-trends");

  if (manifest.status === "error") return <ErrorState error={manifest.error} retry={manifest.retry} />;
  if (trends.status === "error") return <ErrorState error={trends.error} retry={trends.retry} />;
  if (manifest.status !== "ready" || trends.status !== "ready") return <LoadingState blocks={[110, 130, 460, 260, 520]} />;
  return <TrendsView manifest={manifest.data} trends={trends.data} />;
}

export function TrendsView({ manifest, trends }: { manifest: Manifest; trends: LeagueSeasonRecord[] }) {
  const [params, setParams] = useSearchParams();
  const all = useMemo(() => [...trends].sort((a, b) => a.season - b.season), [trends]);
  const seasons = all.map((r) => r.season);
  const firstSeason = seasons[0] ?? 0;
  const lastSeason = seasons.at(-1) ?? 0;

  const clamp = (v: number) => Math.min(Math.max(v, firstSeason), lastSeason);
  const from = clamp(Number(params.get("from")) || firstSeason);
  const to = Math.max(clamp(Number(params.get("to")) || lastSeason), from + 1 <= lastSeason ? from + 1 : from);
  const showCaveats = params.get("caveats") !== "off";

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  const rows = all.filter((r) => r.season >= from && r.season <= to);
  const x = rows.map((r) => r.season);
  const notes = useMemo(() => seasonNotes(all, manifest), [all, manifest]);
  const bands: ChartBand[] = showCaveats
    ? rows.flatMap((r) => {
        const n = notes.get(r.season);
        return n ? [{ from: r.season, to: r.season, label: n.short, tone: n.kind === "expansion" ? "expansion" : "band" } as ChartBand] : [];
      })
    : [];

  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return null;

  const tip = (extra: (r: LeagueSeasonRecord) => TooltipContent["rows"]) => (i: number): TooltipContent => {
    const r = rows[i]!;
    const note = notes.get(r.season);
    return {
      title: `${r.season} · ${r.teams} teams, ${gamesPerTeam(r.games_per_team)} games`,
      rows: [...extra(r), ...(note ? [{ text: note.detail }] : [])],
    };
  };

  const options = seasons.map((s) => ({ value: s, label: String(s) }));
  // Deltas are taken between the rounded values on screen, so 56.0% vs 53.2% reads as +2.8, not +2.9.
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const ppDelta = (a: number | null, b: number | null) => (a === null || b === null ? null : signed(r1(b * 100) - r1(a * 100)));
  const vs = `vs ${first.season}`;

  return (
    <>
      <title>League trends · Court Vision</title>
      <PageHeader
        eyebrow={`Regular season · ${first.season} to ${last.season}`}
        title="League trends"
        sub={headline(first, last)}
        controls={
          <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap">
            <Select label="From" value={from} options={options.filter((o) => o.value < lastSeason)} onChange={(v) => update({ from: v === firstSeason ? null : String(v), to: v >= to ? String(v + 1) : params.get("to") })} className="sm:w-24" />
            <Select label="To" value={to} options={options.filter((o) => o.value > from)} onChange={(v) => update({ to: v === lastSeason ? null : String(v) })} className="sm:w-24" />
            <div className="col-span-2">
              <Checkbox checked={showCaveats} onChange={(v) => update({ caveats: v ? null : "off" })}>
                Shade caveat seasons
              </Checkbox>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Kpi label="3PA rate" value={percent(last.fg3a_rate)} delta={deltaText(ppDelta(first.fg3a_rate, last.fg3a_rate), "pts", vs)} />
        <Kpi label="3P%" value={percent(last.fg3_pct)} delta={deltaText(ppDelta(first.fg3_pct, last.fg3_pct), "pts", vs)} />
        <Kpi label="True shooting" value={percent(last.ts_pct)} delta={deltaText(ppDelta(first.ts_pct, last.ts_pct), "pts", vs)} />
        <Kpi label="Points / team-game" value={fixed(last.pts_per_team_game)} delta={`${signed(r1(last.pts_per_team_game) - r1(first.pts_per_team_game))} ${vs}`} />
        <Kpi label="Teams" value={String(last.teams)} delta={`${signed(last.teams - first.teams, 0)} ${vs}`} />
      </div>

      <Card aria-labelledby="main-chart">
        <CardHead
          id="main-chart"
          title="Three-point attempt rate vs. percentage"
          sub="Share of shots from three, and makes per attempt. Shaded seasons changed who played or where."
          right={<Legend items={[{ color: S1, label: "3PA rate" }, { color: S2, label: "3P%" }]} />}
        />
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="min-w-0 flex-1">
            <LineChart
              x={x}
              height={380}
              label={`Three-point attempt rate rose from ${percent(first.fg3a_rate)} in ${first.season} to ${percent(last.fg3a_rate)} in ${last.season}; three-point percentage went from ${percent(first.fg3_pct)} to ${percent(last.fg3_pct)}.`}
              yFormat={(v) => `${v}%`}
              bands={bands}
              series={[
                { id: "fg3a_rate", label: "3PA rate", color: S1, values: rows.map((r) => asPct(r.fg3a_rate)), endLabel: percent(last.fg3a_rate) },
                { id: "fg3_pct", label: "3P%", color: S2, values: rows.map((r) => asPct(r.fg3_pct)), endLabel: percent(last.fg3_pct) },
              ]}
              endLabelWidth={64}
              tooltip={tip((r) => [
                { color: S1, text: `3PA rate ${percent(r.fg3a_rate)}` },
                { color: S2, text: `3P% ${percent(r.fg3_pct)}` },
              ])}
            />
          </div>
          <div className="flex flex-col gap-5 border-t border-line pt-5 lg:w-[300px] lg:border-t-0 lg:pt-2">
            {takeaways(rows, notes).map((t) => (
              <div key={t.heading} className="flex flex-col gap-1.5">
                <h3 className={`label-caps m-0 ${t.caution ? "text-accent-ink" : "text-ink"}`}>{t.heading}</h3>
                <p className="m-0 text-base leading-normal text-ink">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Points per team-game", (r: LeagueSeasonRecord) => r.pts_per_team_game, (v: number) => v.toFixed(1), (v: number) => String(v)],
            ["True shooting", (r: LeagueSeasonRecord) => asPct(r.ts_pct), (v: number) => `${v.toFixed(1)}%`, (v: number) => `${v}%`],
            ["Assists per team-game", (r: LeagueSeasonRecord) => r.ast_per_team_game, (v: number) => v.toFixed(1), (v: number) => String(v)],
          ] as const
        ).map(([title, get, fmt, axis]) => {
          const values = rows.map(get);
          const end = values.at(-1);
          return (
            <Card key={title} as="figure" className="m-0 gap-2.5 md:px-5 md:py-4">
              <figcaption className="label-caps text-[15px] text-ink">{title}</figcaption>
              <LineChart
                x={x}
                height={180}
                label={`${title} by season, ${first.season} to ${last.season}.`}
                yFormat={axis}
                bands={bands.map((b) => ({ ...b, label: undefined }))}
                series={[{ id: title, label: title, color: S2, values, endLabel: end === null || end === undefined ? undefined : fmt(end) }]}
                endLabelWidth={58}
                tooltip={tip((r) => {
                  const v = get(r);
                  return [{ color: S2, text: `${title} ${v === null ? "n/a" : fmt(v)}` }];
                })}
              />
            </Card>
          );
        })}
      </div>

      <SeasonTable rows={rows} notes={notes} />
    </>
  );
}

function headline(first: LeagueSeasonRecord, last: LeagueSeasonRecord): string {
  if (first.fg3a_rate === null || last.fg3a_rate === null || first.fg3a_rate === 0) return "How the league's game changed, season by season.";
  const change = Math.round(((last.fg3a_rate - first.fg3a_rate) / first.fg3a_rate) * 100);
  const accuracy = first.fg3_pct !== null && last.fg3_pct !== null && Math.abs(last.fg3_pct - first.fg3_pct) < 0.01;
  return `Three-point volume ${change >= 0 ? "rose" : "fell"} ${Math.abs(change)}% from ${first.season} to ${last.season}.${accuracy ? " Accuracy stayed flat." : ""}`;
}

function deltaText(delta: string | null, unit: string, vs: string): string {
  return delta === null ? `n/a ${vs}` : `${delta} ${unit} ${vs}`;
}

function SeasonTable({ rows, notes }: { rows: LeagueSeasonRecord[]; notes: Map<number, SeasonNote> }) {
  const newestFirst = [...rows].reverse();
  const download = () =>
    downloadText(
      `court-vision-league-trends-${rows[0]?.season}-${rows.at(-1)?.season}.csv`,
      toCsv(
        ["season", "teams", "games_per_team", "pts_per_team_game", "fg3a_rate", "fg3_pct", "ts_pct", "ast_per_team_game", "note"],
        newestFirst.map((r) => [r.season, r.teams, r.games_per_team, r.pts_per_team_game, r.fg3a_rate, r.fg3_pct, r.ts_pct, r.ast_per_team_game, notes.get(r.season)?.detail ?? null]),
      ),
    );
  // Alignment is passed separately so two text-* classes never compete.
  const th = (align = "text-right") => `label-caps whitespace-nowrap border-b-2 border-rule px-3 py-2.5 ${align}`;
  const td = (align = "text-right") => `tabular whitespace-nowrap border-b border-line px-3 py-2.5 text-[15px] text-ink ${align}`;
  const wide = "hidden md:table-cell";
  return (
    <Card aria-labelledby="by-season" className="px-2 md:px-6">
      <div className="px-2 md:px-0">
        <CardHead
          id="by-season"
          title="By season"
          sub={
            <>
              Totals per team-game, newest first.<span className="md:hidden"> * marks a caveat season.</span>
            </>
          }
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
              <th scope="col" className={`${th()} ${wide}`}>Teams</th>
              <th scope="col" className={`${th()} ${wide}`}>Games / team</th>
              <th scope="col" className={th()}>Pts</th>
              <th scope="col" className={th()}>3PA rate</th>
              <th scope="col" className={th()}>3P%</th>
              <th scope="col" className={`${th()} ${wide}`}>TS%</th>
              <th scope="col" className={`${th()} ${wide}`}>AST</th>
              <th scope="col" className={`${th("text-left")} ${wide}`}>Note</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((r) => {
              const note = notes.get(r.season);
              return (
                <tr key={r.season}>
                  <th scope="row" className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-display text-[17px] font-bold text-ink">
                    {r.season}
                    {note ? <span className="text-accent-ink md:hidden"> *</span> : null}
                  </th>
                  <td className={`${td()} ${wide}`}>{r.teams}</td>
                  <td className={`${td()} ${wide}`}>{gamesPerTeam(r.games_per_team)}</td>
                  <td className={td()}>{fixed(r.pts_per_team_game)}</td>
                  <td className={td()}><Value text={percent(r.fg3a_rate)} /></td>
                  <td className={td()}><Value text={percent(r.fg3_pct)} /></td>
                  <td className={`${td()} ${wide}`}><Value text={percent(r.ts_pct)} /></td>
                  <td className={`${td()} ${wide}`}>{fixed(r.ast_per_team_game)}</td>
                  <td className={`${td("text-left")} ${wide}`}>
                    {note ? <Badge title={note.detail}>{note.short}</Badge> : <span className="text-muted">None</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
