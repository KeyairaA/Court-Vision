import type { CareerRecord, FranchiseRecord, PlayerSeasonRecord } from "../data/contract";
import { identityIn, labelResolver } from "./franchises";

/** Lower-case, accent-free, punctuation-free: "A'ja" finds "Aja", "Gulich" finds "Gülich". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Name search. Every word typed must start a word of the name, so "wil"
 * finds A'ja Wilson and "a wil" narrows to her. Whole-word matches rank
 * first, then career games, so a regular outranks a ten-game career.
 */
export function searchPlayers(careers: CareerRecord[], query: string, limit = 8): CareerRecord[] {
  const terms = normalizeName(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  return careers
    .map((c) => {
      const words = normalizeName(c.player_name).split(" ");
      const ok = terms.every((t) => words.some((w) => w.startsWith(t)));
      return ok ? { c, score: terms.filter((t) => words.includes(t)).length } : null;
    })
    .filter((x): x is { c: CareerRecord; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || b.c.gp - a.c.gp || a.c.player_name.localeCompare(b.c.player_name))
    .slice(0, limit)
    .map((x) => x.c);
}

export interface SeasonSlot {
  season: number;
  /** Null when the player did not play that season. Never filled in. */
  row: PlayerSeasonRecord | null;
}

/**
 * Every season from a player's first to last in the window, including the
 * ones she missed, so charts break the line and tables say "did not play"
 * instead of quietly skipping a year.
 */
export function seasonSlots(rows: PlayerSeasonRecord[], playerId: number): SeasonSlot[] {
  const mine = rows.filter((r) => r.player_id === playerId).sort((a, b) => a.season - b.season);
  const first = mine[0]?.season;
  const last = mine.at(-1)?.season;
  if (first === undefined || last === undefined) return [];
  const bySeason = new Map(mine.map((r) => [r.season, r]));
  return Array.from({ length: last - first + 1 }, (_, i) => ({ season: first + i, row: bySeason.get(first + i) ?? null }));
}

/** Franchise names a player played for, in order, as they were named at the time. */
export function franchiseNames(rows: PlayerSeasonRecord[], franchises: FranchiseRecord[]): string[] {
  const resolve = labelResolver(franchises);
  const names: string[] = [];
  for (const r of [...rows].sort((a, b) => a.season - b.season)) {
    for (const label of r.teams) {
      const slug = resolve(label, r.season);
      const f = franchises.find((x) => x.slug === slug);
      const name = f ? identityIn(f, r.season)?.name : undefined;
      const text = name ?? label;
      if (!names.includes(text)) names.push(text);
    }
  }
  return names;
}
