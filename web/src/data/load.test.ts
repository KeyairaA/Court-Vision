import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../data/v1/manifest.json";
import { ArtifactError, checkManifest, loadArtifact } from "./load";

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe("checkManifest", () => {
  it("accepts the published manifest", () => {
    expect(checkManifest(manifest).schema_version).toBe("1.0.0");
  });

  it("refuses a schema major it does not understand", () => {
    expect(() => checkManifest({ ...manifest, schema_version: "2.0.0" })).toThrow(/schema 2.0.0/);
  });

  it("refuses something that is not a manifest", () => {
    expect(() => checkManifest([])).toThrow(ArtifactError);
  });
});

describe("loadArtifact", () => {
  it("adds the content hash so a refreshed file gets a new URL", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>((url) => respond(url.includes("manifest") ? manifest : []));
    vi.stubGlobal("fetch", fetchMock);
    await loadArtifact("league-trends");
    const hash = manifest.artifacts["league-trends"].sha256.slice(0, 12);
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain(`/data/v1/league-trends.json?v=${hash}`);
  });

  it("shares one request between concurrent callers", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => respond(manifest));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([loadArtifact("manifest"), loadArtifact("manifest")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["network", () => Promise.reject(new TypeError("offline"))],
    ["http", () => respond("gone", 404)],
    ["parse", () => respond("{not json")],
  ])("reports a %s failure by kind, and retries cleanly", async (kind, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(loadArtifact("manifest")).rejects.toMatchObject({ kind });
    vi.stubGlobal("fetch", vi.fn(() => respond(manifest)));
    await expect(loadArtifact("manifest")).resolves.toMatchObject({ schema_version: "1.0.0" });
  });
});
