/**
 * Head-to-head logic for the Compare page. Works on either a career record
 * or a single season: both carry the same per-game and rate fields.
 */
export interface PerGame {
  gp: number;
  min_pg: number;
  pts_pg: number;
  reb_pg: number;
  ast_pg: number;
  stl_pg: number;
  blk_pg: number;
  tov_pg: number;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
  ts_pct: number | null;
  ast_to: number | null;
}

export interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
  kind: "count" | "rate" | "ratio";
  /** null: no better side (minutes played is context, not a skill). */
  better: "higher" | "lower" | null;
}

export const COMPARE_ROWS: { label: string; get: (p: PerGame) => number | null; kind: CompareRow["kind"]; better: CompareRow["better"] }[] = [
  { label: "Minutes", get: (p) => p.min_pg, kind: "count", better: null },
  { label: "Points", get: (p) => p.pts_pg, kind: "count", better: "higher" },
  { label: "Rebounds", get: (p) => p.reb_pg, kind: "count", better: "higher" },
  { label: "Assists", get: (p) => p.ast_pg, kind: "count", better: "higher" },
  { label: "Steals", get: (p) => p.stl_pg, kind: "count", better: "higher" },
  { label: "Blocks", get: (p) => p.blk_pg, kind: "count", better: "higher" },
  { label: "Turnovers", get: (p) => p.tov_pg, kind: "count", better: "lower" },
  { label: "FG%", get: (p) => p.fg_pct, kind: "rate", better: "higher" },
  { label: "3P%", get: (p) => p.fg3_pct, kind: "rate", better: "higher" },
  { label: "FT%", get: (p) => p.ft_pct, kind: "rate", better: "higher" },
  { label: "True shooting", get: (p) => p.ts_pct, kind: "rate", better: "higher" },
  { label: "AST/TO", get: (p) => p.ast_to, kind: "ratio", better: "higher" },
];

/** The value as displayed, so "better" is judged on what the reader sees. */
export function displayed(v: number, kind: CompareRow["kind"]): number {
  if (kind === "rate") return Math.round(v * 1000) / 10;
  if (kind === "ratio") return Math.round(v * 100) / 100;
  return Math.round(v * 10) / 10;
}

export type Winner = "a" | "b" | "even" | null;

/**
 * Which side is better on a row. Ties are judged at display precision: two
 * players both shown at 58.1% true shooting are even, whatever the fourth
 * decimal says. A missing value never wins or loses.
 */
export function winner(row: CompareRow): Winner {
  if (row.better === null || row.a === null || row.b === null) return null;
  const a = displayed(row.a, row.kind);
  const b = displayed(row.b, row.kind);
  if (a === b) return "even";
  return (a > b) === (row.better === "higher") ? "a" : "b";
}

export function headToHead(a: PerGame, b: PerGame): (CompareRow & { winner: Winner })[] {
  return COMPARE_ROWS.map((r) => {
    const row: CompareRow = { label: r.label, a: r.get(a), b: r.get(b), kind: r.kind, better: r.better };
    return { ...row, winner: winner(row) };
  });
}

/**
 * The sample-size sentence. A comparison of 304 games against 89 is not
 * like for like, and the page says so before it shows a single number.
 */
export function sampleSentence(a: { name: string; gp: number; seasons: number }, b: { name: string; gp: number; seasons: number }): { lead: string; body: string; lopsided: boolean } {
  const [big, small] = a.gp >= b.gp ? [a, b] : [b, a];
  const share = big.gp === 0 ? 1 : small.gp / big.gp;
  const last = (n: string) => n.split(" ").slice(-1)[0] ?? n;
  const seasons = (n: number) => `${n} ${n === 1 ? "season" : "seasons"}`;
  if (share < 0.5) {
    return {
      lopsided: true,
      lead: "Not a like-for-like sample.",
      body: `${last(small.name)}'s ${small.gp} games are ${Math.round(share * 100)}% of ${last(big.name)}'s ${big.gp}, from ${seasons(small.seasons)} against ${seasons(big.seasons)}. Per-game rates compare fairly. Totals do not, and a short career can still move a lot.`,
    };
  }
  return {
    lopsided: false,
    lead: "Comparable samples.",
    body: `${last(a.name)} has ${a.gp} games over ${seasons(a.seasons)}; ${last(b.name)} has ${b.gp} over ${seasons(b.seasons)}. Per-game numbers compare fairly.`,
  };
}
