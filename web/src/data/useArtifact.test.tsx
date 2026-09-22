import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../data/v1/manifest.json";
import { loadArtifact } from "./load";
import { useArtifact } from "./useArtifact";

function Probe() {
  const m = useArtifact("manifest");
  return (
    <div>
      <p>{m.status}</p>
      {m.status === "error" ? <button onClick={m.retry}>retry</button> : null}
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("useArtifact", () => {
  it("shows data that settled before the component mounted", async () => {
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify(manifest)))));
    await loadArtifact("manifest");
    render(<Probe />);
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("re-renders every subscriber when a shared request settles", async () => {
    let finish: (r: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>(() => new Promise((r) => (finish = r))));
    void loadArtifact("manifest").catch(() => undefined);
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    expect(screen.getAllByText("loading")).toHaveLength(2);
    await act(async () => finish(new Response(JSON.stringify(manifest))));
    expect(screen.getAllByText("ready")).toHaveLength(2);
  });

  it("reports a failure and recovers on retry", async () => {
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>(() => Promise.reject(new TypeError("offline"))));
    render(<Probe />);
    expect(await screen.findByText("error")).toBeInTheDocument();
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify(manifest)))));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });
});
