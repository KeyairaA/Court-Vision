import { describe, expect, it } from "vitest";
import careersJson from "../../../data/v1/careers.json";
import franchisesJson from "../../../data/v1/franchises.json";
import playersJson from "../../../data/v1/player-seasons.json";
import type { CareerRecord, FranchiseRecord, PlayerSeasonRecord } from "../data/contract";
import { franchiseNames, normalizeName, searchPlayers, seasonSlots } from "./players";

const careers = careersJson as CareerRecord[];
const players = playersJson as PlayerSeasonRecord[];
const franchises = franchisesJson as FranchiseRecord[];
const WILSON = 1628932;
const STEWART = 1627668;
const PLUM = 1628276;

describe("normalizeName", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeName("A'ja Wilson")).toBe("aja wilson");
    expect(normalizeName("Marie Gülich")).toBe("marie gulich");
    expect(normalizeName("  Ivana   Dojkić ")).toBe("ivana dojkic");
  });
});

describe("searchPlayers", () => {
  it("matches word starts", () => {
    expect(searchPlayers(careers, "aja")[0]?.player_name).toBe("A'ja Wilson");
    expect(searchPlayers(careers, "a'ja wil")[0]?.player_name).toBe("A'ja Wilson");
    expect(searchPlayers(careers, "gulich")[0]?.player_name).toBe("Marie Gülich");
  });

  it("puts regulars ahead of short careers on a partial name", () => {
    const names = searchPlayers(careers, "wil").map((p) => p.player_name);
    expect(names.slice(0, 4)).toEqual(["Courtney Williams", "Elizabeth Williams", "A'ja Wilson", "Gabby Williams"]);
    expect(searchPlayers(careers, "wilson")[0]?.player_name).toBe("A'ja Wilson");
  });

  it("returns nothing for an empty query and caps results", () => {
    expect(searchPlayers(careers, "   ")).toEqual([]);
    expect(searchPlayers(careers, "a", 5)).toHaveLength(5);
  });
});

describe("seasonSlots", () => {
  it("keeps a missed season as an empty slot instead of skipping it", () => {
    const slots = seasonSlots(players, STEWART);
    expect(slots.map((s) => s.season)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(slots.find((s) => s.season === 2019)?.row).toBeNull();
  });

  it("covers every season a player played", () => {
    const slots = seasonSlots(players, WILSON);
    expect(slots).toHaveLength(9);
    expect(slots.every((s) => s.row !== null)).toBe(true);
  });

  it("is empty for an unknown player", () => {
    expect(seasonSlots(players, 1)).toEqual([]);
  });
});

describe("franchiseNames", () => {
  it("names each franchise once, in order, as it was called at the time", () => {
    const rows = (id: number) => players.filter((p) => p.player_id === id);
    expect(franchiseNames(rows(WILSON), franchises)).toEqual(["Las Vegas Aces"]);
    expect(franchiseNames(rows(PLUM), franchises)).toEqual(expect.arrayContaining(["Los Angeles Sparks", "Phoenix Mercury"]));
  });
});
