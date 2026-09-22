import { describe, expect, it } from "vitest";
import { artifactsFor } from "./prefetch";

describe("artifactsFor", () => {
  it("always starts with the manifest", () => {
    for (const path of ["/", "/leaders", "/players/1628932", "/compare", "/how-it-works", "/nope"]) {
      expect(artifactsFor(path)[0]).toBe("manifest");
    }
  });

  it("fetches only what a page uses", () => {
    expect(artifactsFor("/")).toEqual(["manifest", "league-trends"]);
    expect(artifactsFor("/players/1628932")).toContain("careers");
    expect(artifactsFor("/leaders")).not.toContain("careers");
    expect(artifactsFor("/nope")).toEqual(["manifest"]);
  });
});
