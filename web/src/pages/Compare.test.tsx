import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import careers from "../../../data/v1/careers.json";
import franchises from "../../../data/v1/franchises.json";
import trends from "../../../data/v1/league-trends.json";
import manifest from "../../../data/v1/manifest.json";
import players from "../../../data/v1/player-seasons.json";
import type { CareerRecord, FranchiseRecord, LeagueSeasonRecord, Manifest, PlayerSeasonRecord } from "../data/contract";
import { CompareView } from "./Compare";

const WILSON = 1628932;
const CLARK = 1642286;

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/compare",
        element: (
          <CompareView
            manifest={manifest as Manifest}
            trends={trends as LeagueSeasonRecord[]}
            players={players as PlayerSeasonRecord[]}
            careers={careers as CareerRecord[]}
            franchises={franchises as FranchiseRecord[]}
          />
        ),
      },
    ],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

const h2hRow = (label: string) => within(screen.getByRole("table")).getByRole("rowheader", { name: new RegExp(`^${label}`) }).closest("tr")! as HTMLElement;

describe("Compare, with the published data", () => {
  it("states the sample size before the numbers", () => {
    renderAt(`/compare?a=${WILSON}&b=${CLARK}`);
    expect(screen.getByText("Not a like-for-like sample.")).toBeInTheDocument();
    expect(screen.getByText(/Clark's 89 games are 29% of Wilson's 304/)).toBeInTheDocument();
  });

  it("marks the better value, and ties as even", () => {
    renderAt(`/compare?a=${WILSON}&b=${CLARK}`);
    expect(within(h2hRow("Points")).getAllByText("Better:")).toHaveLength(1);
    expect(within(h2hRow("True shooting")).getByText("even")).toBeInTheDocument();
    expect(within(h2hRow("Turnovers")).getByText("lower is better")).toBeInTheDocument();
  });

  it("compares one shared season and flags a short one", () => {
    renderAt(`/compare?a=${WILSON}&b=${CLARK}&scope=season&season=2025`);
    expect(screen.getByText("One side is a short season.")).toBeInTheDocument();
    expect(screen.getByText(/Wilson played 40 and Clark 13 of 44 games/)).toBeInTheDocument();
  });

  it("defaults to the latest season's two top scorers", () => {
    renderAt("/compare");
    expect(screen.getByRole("link", { name: "A'ja Wilson" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kelsey Mitchell" })).toBeInTheDocument();
  });

  it("keeps the player from a profile link and picks a sensible partner", () => {
    renderAt(`/compare?a=${CLARK}`);
    expect(screen.getByRole("link", { name: "Caitlin Clark" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "A'ja Wilson" })).toBeInTheDocument();
  });

  it("swaps sides", () => {
    renderAt(`/compare?a=${WILSON}&b=${CLARK}`);
    fireEvent.click(screen.getByRole("button", { name: "Swap players" }));
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[1]).toContain("Caitlin Clark");
  });

  it("asks for two different players", () => {
    renderAt(`/compare?a=${WILSON}&b=${WILSON}`);
    expect(screen.getByText("Pick two different players to compare.")).toBeInTheDocument();
  });
});
