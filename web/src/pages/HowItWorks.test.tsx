import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import franchises from "../../../data/v1/franchises.json";
import trends from "../../../data/v1/league-trends.json";
import manifest from "../../../data/v1/manifest.json";
import { timelineRows } from "../components/charts/FranchiseTimeline";
import type { FranchiseRecord, LeagueSeasonRecord, Manifest } from "../data/contract";
import { HowItWorksView, SECTIONS } from "./HowItWorks";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn<() => void>();
});

function renderAt(url: string) {
  const router = createMemoryRouter(
    [{ path: "/how-it-works", element: <HowItWorksView manifest={manifest as Manifest} trends={trends as LeagueSeasonRecord[]} franchises={franchises as FranchiseRecord[]} /> }],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

describe("How it Works, with the published data", () => {
  it("has every section, in order", () => {
    renderAt("/how-it-works");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(SECTIONS.map((s) => s.title));
  });

  it("reads its numbers from the manifest", () => {
    renderAt("/how-it-works");
    expect(screen.getByText("600 / 600")).toBeInTheDocument();
    expect(screen.getByText(/The 98 missing games were filled from box scores/)).toBeInTheDocument();
    expect(screen.getByText(/Data through Sep 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/87\.1 per team-game/)).toBeInTheDocument();
  });

  it("uses the pipeline's free throw coefficient and nothing else", () => {
    const { container } = renderAt("/how-it-works");
    expect(container.textContent).toContain("0.44");
    expect(container.textContent).not.toContain("0.475");
  });

  it("lists the caveat seasons with their short labels", () => {
    renderAt("/how-it-works");
    const caveats = screen.getByRole("region", { name: "Seasons with caveats" });
    expect(within(caveats).getByText("22 games")).toBeInTheDocument();
    expect(within(caveats).getByText("15 teams")).toBeInTheDocument();
  });

  it("scrolls to a section named in the URL", () => {
    renderAt("/how-it-works#checks");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe("timelineRows", () => {
  const rows = timelineRows(franchises as FranchiseRecord[], 2026);
  const by = (slug: string) => rows.find((r) => r.slug === slug)!;

  it("includes only franchises whose label changed or whose lineage broke", () => {
    expect(rows.map((r) => r.slug).sort()).toEqual(["connecticut-sun", "dallas-wings", "las-vegas-aces", "phoenix-mercury", "portland-fire"]);
  });

  it("keeps a lineage break as two eras and says so", () => {
    expect(by("portland-fire").eras).toHaveLength(2);
    expect(by("portland-fire").note).toMatch(/new franchise, so their histories are never joined/);
  });

  it("marks a relocation that has not happened yet as future", () => {
    const houston = by("connecticut-sun").eras[0]!.find((s) => s.label === "HOU")!;
    expect(houston).toMatchObject({ from: 2027, future: true });
    expect(by("connecticut-sun").name).toBe("Connecticut Sun");
    expect(by("connecticut-sun").note).toMatch(/In 2027, becomes the Houston Comets/);
    expect(by("phoenix-mercury").note).toMatch(/label changes from PHO to PHX/);
  });
});
