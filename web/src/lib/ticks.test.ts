import { describe, expect, it } from "vitest";
import { niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("brackets the data on round steps", () => {
    const { domain, ticks } = niceTicks(25.7, 37.1);
    expect(domain[0]).toBeLessThanOrEqual(25.7);
    expect(domain[1]).toBeGreaterThanOrEqual(37.1);
    const steps = new Set(ticks.slice(1).map((t, i) => Number((t - ticks[i]!).toFixed(6))));
    expect(steps.size).toBe(1);
  });

  it("handles a flat series", () => {
    const { ticks } = niceTicks(20, 20);
    expect(ticks[0]).toBeLessThan(20);
    expect(ticks.at(-1)).toBeGreaterThan(20);
  });

  it("does not produce floating point noise", () => {
    expect(niceTicks(0.1, 0.7).ticks.every((t) => String(t).length < 6)).toBe(true);
  });
});
