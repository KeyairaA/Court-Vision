import { describe, expect, it } from "vitest";
import { fixed, gamesPerTeam, longDate, NA, percent, signed } from "./format";

describe("format", () => {
  it("never renders a missing rate as zero", () => {
    expect(percent(null)).toBe(NA);
    expect(fixed(undefined)).toBe(NA);
    expect(percent(Number.NaN)).toBe(NA);
    expect(percent(0)).toBe("0.0%");
  });

  it("formats fractions as percentages", () => {
    expect(percent(0.371)).toBe("37.1%");
    expect(percent(0.58095)).toBe("58.1%");
  });

  it("signs deltas without a negative zero", () => {
    expect(signed(11.4)).toBe("+11.4");
    expect(signed(-0.3)).toBe("-0.3");
    expect(signed(-0.01)).toBe("+0.0");
    expect(signed(3, 0)).toBe("+3");
  });

  it("shows dates in UTC so every visitor sees the same day", () => {
    expect(longDate("2026-09-20T23:59:00+00:00")).toBe("Sep 20, 2026");
    expect(longDate("2026-07-22")).toBe("Jul 22, 2026");
    expect(longDate(null)).toBeNull();
    expect(longDate("not a date")).toBeNull();
  });

  it("keeps forfeit-adjusted season lengths", () => {
    expect(gamesPerTeam(34)).toBe("34");
    expect(gamesPerTeam(33.8)).toBe("33.8");
    expect(gamesPerTeam(null)).toBe(NA);
  });
});
