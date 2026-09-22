import { describe, expect, it } from "vitest";
import franchisesJson from "../../../data/v1/franchises.json";
import playersJson from "../../../data/v1/player-seasons.json";
import type { FranchiseRecord, PlayerSeasonRecord } from "../data/contract";
import { franchisesIn, labelResolver } from "./franchises";
import { defaultMinGames, rankLeaders, statByKey, type LeaderQuery } from "./leaders";

const players = playersJson as PlayerSeasonRecord[];
const franchises = franchisesJson as FranchiseRecord[];
const resolve = labelResolver(franchises);
const q = (over: Partial<LeaderQuery> = {}): LeaderQuery => ({
  season: 2026,
  stat: statByKey("pts"),
  basis: "per-game",
  minGames: 20,
  franchise: null,
  resolve,
  ...over,
});

describe("rankLeaders, against the published data", () => {
  it("matches the 2026 scoring leaders in the design brief", () => {
    const top = rankLeaders(players, q()).slice(0, 10).map((l) => [l.row.player_name, l.value.toFixed(1)]);
    expect(top).toEqual([
      ["A'ja Wilson", "26.0"],
      ["Kelsey Mitchell", "25.0"],
      ["Caitlin Clark", "22.5"],
      ["Kahleah Copper", "21.3"],
      ["Marina Mabrey", "20.8"],
      ["Paige Bueckers", "20.5"],
      ["Breanna Stewart", "20.4"],
      ["Olivia Miles", "19.7"],
      ["Allisha Gray", "19.3"],
      ["Jackie Young", "18.9"],
    ]);
  });

  it("brings a traded player in when the minimum drops", () => {
    const plum = rankLeaders(players, q({ minGames: 15 })).find((l) => l.row.player_name === "Kelsey Plum");
    expect(plum).toMatchObject({ rank: 4, row: { is_multi_team: true, teams: ["LAS", "PHX"] } });
  });

  it("filters by franchise across label changes and trades", () => {
    const phoenix2026 = rankLeaders(players, q({ franchise: "phoenix-mercury", minGames: 1 })).map((l) => l.row.player_name);
    expect(phoenix2026).toContain("DeWanna Bonner"); // PHX, then ATL
    expect(phoenix2026).toContain("Kelsey Plum"); // LAS, then PHX
    const phoenix2024 = rankLeaders(players, q({ season: 2024, franchise: "phoenix-mercury", minGames: 1 }));
    expect(phoenix2024.length).toBeGreaterThan(5); // labelled PHO that season
    expect(phoenix2024.every((l) => l.row.teams.includes("PHO"))).toBe(true);
  });

  it("applies the attempt qualifier to shooting percentages", () => {
    const threes = rankLeaders(players, q({ stat: statByKey("fg3_pct") }));
    expect(threes.length).toBeGreaterThan(10);
    expect(threes.every((l) => l.row.fg3a / l.row.gp >= 2)).toBe(true);
  });

  it("ranks per 36 minutes from the per-36 column", () => {
    const [first] = rankLeaders(players, q({ basis: "per-36" }));
    expect(first!.value).toBe(first!.row.pts_per36);
  });

  it("ignores per 36 for minutes", () => {
    const [first] = rankLeaders(players, q({ stat: statByKey("min"), basis: "per-36" }));
    expect(first!.value).toBe(first!.row.min_pg);
  });
});

describe("rankLeaders ties", () => {
  it("share a rank and list by name", () => {
    const base = players.find((p) => p.season === 2026)!;
    const rows = [
      { ...base, player_id: 1, player_name: "Cee", pts_pg: 20 },
      { ...base, player_id: 2, player_name: "Bea", pts_pg: 20 },
      { ...base, player_id: 3, player_name: "Aya", pts_pg: 18 },
    ];
    expect(rankLeaders(rows, q({ minGames: 1 })).map((l) => [l.rank, l.row.player_name])).toEqual([
      [1, "Bea"],
      [1, "Cee"],
      [3, "Aya"],
    ]);
  });
});

describe("defaults and franchises", () => {
  it("uses half the season as the default minimum", () => {
    expect(defaultMinGames(40)).toBe(20);
    expect(defaultMinGames(33.8)).toBe(17);
    expect(defaultMinGames(22)).toBe(11);
    expect(defaultMinGames(null)).toBe(1);
  });

  it("lists the franchises that played, named as they were that season", () => {
    const names2026 = franchisesIn(franchises, 2026).map((f) => f.name);
    expect(names2026).toHaveLength(15);
    expect(names2026).toEqual(expect.arrayContaining(["Toronto Tempo", "Portland Fire", "Connecticut Sun"]));
    expect(franchisesIn(franchises, 2024).map((f) => f.name)).not.toContain("Toronto Tempo");
    expect(franchisesIn(franchises, 2027).map((f) => f.name)).toContain("Houston Comets");
  });

  it("resolves labels within their season", () => {
    expect(resolve("PHO", 2024)).toBe("phoenix-mercury");
    expect(resolve("PHX", 2025)).toBe("phoenix-mercury");
    expect(resolve("PHO", 2025)).toBeUndefined();
    expect(resolve("SAN", 2017)).toBe("las-vegas-aces");
  });
});
