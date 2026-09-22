import type { LeagueSeasonRecord, Manifest } from "../data/contract";

export type SeasonNoteKind = "expansion" | "short";

export interface SeasonNote {
  season: number;
  kind: SeasonNoteKind;
  /** A few words for chart bands and table badges: "15 teams", "22 games". */
  short: string;
  /** The pipeline's full caveat, for tooltips. */
  detail: string;
}

/**
 * Chart bands and table badges come from the data, not from a hard-coded
 * list: a season is marked when the pipeline flags it as confounded, and the
 * label is derived from what changed. A 2027 relocation or a future expansion
 * shows up here the day it lands in the artifacts.
 */
export function seasonNotes(trends: LeagueSeasonRecord[], manifest: Manifest): Map<number, SeasonNote> {
  const notes = new Map<number, SeasonNote>();
  const sorted = [...trends].sort((a, b) => a.season - b.season);
  const lengths = sorted.map((s) => s.games_per_team).filter((g): g is number => g !== null).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length / 2)] ?? 0;

  sorted.forEach((row, i) => {
    const detail = row.confound ?? manifest.confounded_seasons[String(row.season)];
    if (!detail) return;
    const previous = sorted[i - 1];
    if (previous && row.teams > previous.teams) {
      notes.set(row.season, { season: row.season, kind: "expansion", short: `${row.teams} teams`, detail });
    } else if (row.games_per_team !== null && row.games_per_team < typical * 0.75) {
      notes.set(row.season, { season: row.season, kind: "short", short: `${row.games_per_team} games`, detail });
    } else {
      notes.set(row.season, { season: row.season, kind: "short", short: "Caveat", detail });
    }
  });
  return notes;
}

/** Human line for the partial-season banner, or null when every season is complete. */
export function partialSeasonMessage(manifest: Manifest): string | null {
  const season = manifest.partial_seasons.at(-1);
  if (season === undefined) return null;
  const through = manifest.quality[String(season)]?.last_covered_date;
  const date = through ? new Date(`${through}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  return date ? `${season} player stats cover games through ${date}.` : `${season} player stats are incomplete.`;
}
