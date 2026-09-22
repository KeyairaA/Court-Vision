import type { PlayerSeasonRecord } from "../data/contract";

export type Basis = "per-game" | "per-36";

export type StatKey = "pts" | "reb" | "ast" | "stl" | "blk" | "min" | "ts_pct" | "fg3_pct" | "fg_pct" | "ast_to";

type Row = PlayerSeasonRecord;

export interface StatDef {
  key: StatKey;
  label: string;
  /** Column header. */
  short: string;
  kind: "count" | "rate" | "ratio";
  value: (r: Row, basis: Basis) => number | null;
  /**
   * Extra bar a rate must clear, stated in the UI. Without it a player who
   * went 3 for 3 in two games tops the three-point list.
   */
  qualifier?: { test: (r: Row) => boolean; text: string };
  /** Volume shown beside a rate so the sample is visible. */
  volume?: { short: string; value: (r: Row) => number };
}

const perGame = (total: number, gp: number) => (gp > 0 ? total / gp : 0);

function counting(key: "pts" | "reb" | "ast" | "stl" | "blk", label: string, short: string): StatDef {
  return {
    key,
    label,
    short,
    kind: "count",
    value: (r, basis) => (basis === "per-36" ? r[`${key}_per36`] : r[`${key}_pg`]),
  };
}

export const STATS: StatDef[] = [
  counting("pts", "Points", "PTS"),
  counting("reb", "Rebounds", "REB"),
  counting("ast", "Assists", "AST"),
  counting("stl", "Steals", "STL"),
  counting("blk", "Blocks", "BLK"),
  { key: "min", label: "Minutes", short: "MIN", kind: "count", value: (r) => r.min_pg },
  {
    key: "ts_pct",
    label: "True shooting",
    short: "TS%",
    kind: "rate",
    value: (r) => r.ts_pct,
    qualifier: { test: (r) => perGame(r.fga, r.gp) >= 5, text: "at least 5 field goal attempts per game" },
    volume: { short: "FGA", value: (r) => perGame(r.fga, r.gp) },
  },
  {
    key: "fg3_pct",
    label: "3-point %",
    short: "3P%",
    kind: "rate",
    value: (r) => r.fg3_pct,
    qualifier: { test: (r) => perGame(r.fg3a, r.gp) >= 2, text: "at least 2 three-point attempts per game" },
    volume: { short: "3PA", value: (r) => perGame(r.fg3a, r.gp) },
  },
  {
    key: "fg_pct",
    label: "Field goal %",
    short: "FG%",
    kind: "rate",
    value: (r) => r.fg_pct,
    qualifier: { test: (r) => perGame(r.fga, r.gp) >= 5, text: "at least 5 field goal attempts per game" },
    volume: { short: "FGA", value: (r) => perGame(r.fga, r.gp) },
  },
  {
    key: "ast_to",
    label: "Assist to turnover",
    short: "AST/TO",
    kind: "ratio",
    value: (r) => r.ast_to,
    qualifier: { test: (r) => r.ast_pg >= 2, text: "at least 2 assists per game" },
    volume: { short: "AST", value: (r) => r.ast_pg },
  },
];

export const statByKey = (key: string): StatDef => STATS.find((s) => s.key === key) ?? STATS[0]!;

/** Minutes has no per-36 form: every player plays 36 minutes per 36 minutes. */
export const supportsPer36 = (stat: StatDef) => stat.kind === "count" && stat.key !== "min";

export interface LeaderQuery {
  season: number;
  stat: StatDef;
  basis: Basis;
  minGames: number;
  /** Franchise slug, or null for the whole league. */
  franchise: string | null;
  /** Maps a season's team label to its franchise slug. */
  resolve: (label: string, season: number) => string | undefined;
}

export interface Leader {
  rank: number;
  row: Row;
  value: number;
}

/**
 * Rank one season. Ties share a rank (1, 2, 2, 4) and are listed by name, so
 * the order never depends on the order of the source file.
 */
export function rankLeaders(rows: Row[], q: LeaderQuery): Leader[] {
  const basis = supportsPer36(q.stat) ? q.basis : "per-game";
  const eligible = rows.filter(
    (r) =>
      r.season === q.season &&
      r.gp >= q.minGames &&
      (!q.stat.qualifier || q.stat.qualifier.test(r)) &&
      (q.franchise === null || r.teams.some((t) => q.resolve(t, r.season) === q.franchise)),
  );
  const scored = eligible
    .map((row) => ({ row, value: q.stat.value(row, basis) }))
    .filter((x): x is { row: Row; value: number } => x.value !== null && Number.isFinite(x.value))
    .sort((a, b) => b.value - a.value || a.row.player_name.localeCompare(b.row.player_name));

  let rank = 0;
  let previous: number | null = null;
  return scored.map((x, i) => {
    if (previous === null || Math.abs(x.value - previous) > 1e-9) rank = i + 1;
    previous = x.value;
    return { rank, ...x };
  });
}

/** A season's default minimum: half of that season's games per team, the same line the charts use for "short season". */
export function defaultMinGames(gamesPerTeam: number | null | undefined): number {
  return gamesPerTeam ? Math.ceil(gamesPerTeam / 2) : 1;
}
