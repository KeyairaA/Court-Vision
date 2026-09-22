import { describe, expect, it } from "vitest";
import manifest from "../../../data/v1/manifest.json";
import trends from "../../../data/v1/league-trends.json";
import type { LeagueSeasonRecord, Manifest } from "../data/contract";
import { partialSeasonMessage, seasonNotes } from "./seasons";

const m = manifest as Manifest;
const t = trends as LeagueSeasonRecord[];

describe("seasonNotes, against the published data", () => {
  const notes = seasonNotes(t, m);

  it("labels the bubble season by its length", () => {
    expect(notes.get(2020)).toMatchObject({ kind: "short", short: "22 games" });
  });

  it("labels expansion seasons by team count", () => {
    expect(notes.get(2025)).toMatchObject({ kind: "expansion", short: "13 teams" });
    expect(notes.get(2026)).toMatchObject({ kind: "expansion", short: "15 teams" });
  });

  it("marks only the seasons the pipeline flags", () => {
    expect([...notes.keys()].sort()).toEqual(Object.keys(m.confounded_seasons).map(Number).sort());
  });

  it("derives a note for a season it has never seen", () => {
    const future: LeagueSeasonRecord = { ...t.at(-1)!, season: 2027, teams: 16, confound: "Expansion to 16 teams" };
    expect(seasonNotes([...t, future], m).get(2027)).toMatchObject({ kind: "expansion", short: "16 teams" });
  });
});

describe("partialSeasonMessage", () => {
  it("is silent when every season is complete", () => {
    expect(partialSeasonMessage(m)).toBeNull();
  });

  it("names the last covered date", () => {
    const partial: Manifest = {
      ...m,
      partial_seasons: [2026],
      quality: { ...m.quality, "2026": { ...m.quality["2026"]!, last_covered_date: "2026-07-22" } },
    };
    expect(partialSeasonMessage(partial)).toBe("2026 player stats cover games through Jul 22.");
  });
});
