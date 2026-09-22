import type { LeagueSeasonRecord } from "../data/contract";
import { percent } from "../lib/format";
import type { SeasonNote } from "../lib/seasons";

export interface Takeaway {
  heading: string;
  body: string;
  caution?: boolean;
}

const pp = (a: number | null, b: number | null) => (a === null || b === null ? 0 : (b - a) * 100);

/**
 * The written takeaway beside the main chart. Numbers are interpolated from
 * the selected seasons, and each sentence is only used when the data still
 * supports it, so the copy cannot quietly go stale after a refresh.
 */
export function takeaways(rows: LeagueSeasonRecord[], notes: Map<number, SeasonNote>): Takeaway[] {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last || rows.length < 2) return [];
  const out: Takeaway[] = [];

  const rises = rows.slice(1).filter((r, i) => (r.fg3a_rate ?? 0) > (rows[i]?.fg3a_rate ?? 0)).length;
  const direction = pp(first.fg3a_rate, last.fg3a_rate) >= 0 ? "up from" : "down from";
  out.push({
    heading: "What changed",
    body: `${percent(last.fg3a_rate)} of shots now come from three, ${direction} ${percent(first.fg3a_rate)} in ${first.season}. The share rose in ${rises} of ${rows.length - 1} seasons.`,
  });

  const accuracy = rows.map((r) => r.fg3_pct).filter((v): v is number => v !== null);
  const lo = Math.min(...accuracy);
  const hi = Math.max(...accuracy);
  const tsGain = pp(first.ts_pct, last.ts_pct);
  if ((hi - lo) * 100 < 2) {
    out.push({
      heading: "What did not",
      body:
        `Three-point percentage stayed between ${percent(lo)} and ${percent(hi)} throughout.` +
        (tsGain >= 1 ? " So the rise in true shooting came from somewhere else." : ""),
    });
  } else {
    out.push({
      heading: "Accuracy",
      body: `Three-point percentage moved from ${percent(first.fg3_pct)} to ${percent(last.fg3_pct)}.`,
    });
  }

  const note = notes.get(last.season);
  const previous = rows.at(-2);
  if (note?.kind === "expansion" && previous) {
    const added = last.teams - previous.teams;
    const jump = last.pts_per_team_game - previous.pts_per_team_game;
    out.push({
      heading: "Read with care",
      caution: true,
      body:
        jump >= 2
          ? `The ${last.season} scoring jump to ${last.pts_per_team_game.toFixed(1)} arrived with ${added} expansion ${added === 1 ? "team" : "teams"}. One season is not a trend yet.`
          : `${last.season} added ${added} expansion ${added === 1 ? "team" : "teams"}, which changes who is shooting as well as how.`,
    });
  } else {
    const marked = rows.filter((r) => notes.has(r.season)).map((r) => r.season);
    if (marked.length) {
      out.push({ heading: "Read with care", caution: true, body: `Shaded seasons (${marked.join(", ")}) changed who played or where. Compare them with care.` });
    }
  }
  return out;
}
