import { describe, expect, it } from "vitest";
import careersJson from "../../../data/v1/careers.json";
import type { CareerRecord } from "../data/contract";
import { headToHead, sampleSentence, winner } from "./compare";

const careers = careersJson as CareerRecord[];
const wilson = careers.find((c) => c.player_name === "A'ja Wilson")!;
const clark = careers.find((c) => c.player_name === "Caitlin Clark")!;

describe("headToHead, Wilson vs. Clark careers", () => {
  const rows = new Map(headToHead(wilson, clark).map((r) => [r.label, r]));

  it("picks the better side per row", () => {
    expect(rows.get("Points")!.winner).toBe("a");
    expect(rows.get("Assists")!.winner).toBe("b");
  });

  it("treats fewer turnovers as better", () => {
    expect(rows.get("Turnovers")!.winner).toBe("a");
  });

  it("calls a tie at the precision shown even", () => {
    // 58.10% vs 58.07%: both display as 58.1%.
    expect(rows.get("True shooting")!.winner).toBe("even");
  });

  it("does not crown anyone on minutes", () => {
    expect(rows.get("Minutes")!.winner).toBeNull();
  });
});

describe("winner", () => {
  it("never scores a missing value", () => {
    expect(winner({ label: "3P%", a: null, b: 0.35, kind: "rate", better: "higher" })).toBeNull();
  });
});

describe("sampleSentence", () => {
  it("says a lopsided sample is not like for like", () => {
    const s = sampleSentence({ name: "A'ja Wilson", gp: 304, seasons: 9 }, { name: "Caitlin Clark", gp: 89, seasons: 3 });
    expect(s.lopsided).toBe(true);
    expect(`${s.lead} ${s.body}`).toMatch(/^Not a like-for-like sample\. Clark's 89 games are 29% of Wilson's 304, from 3 seasons against 9 seasons\./);
  });

  it("is plain about comparable samples", () => {
    const s = sampleSentence({ name: "A", gp: 300, seasons: 9 }, { name: "B", gp: 250, seasons: 8 });
    expect(s).toMatchObject({ lopsided: false, lead: "Comparable samples." });
  });
});
