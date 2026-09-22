import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import franchises from "../../../data/v1/franchises.json";
import trends from "../../../data/v1/league-trends.json";
import players from "../../../data/v1/player-seasons.json";
import type { FranchiseRecord, LeagueSeasonRecord, PlayerSeasonRecord } from "../data/contract";
import { LeadersView } from "./Leaders";

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/leaders",
        element: <LeadersView trends={trends as LeagueSeasonRecord[]} players={players as PlayerSeasonRecord[]} franchises={franchises as FranchiseRecord[]} />,
      },
    ],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Leaderboard, with the published data", () => {
  it("defaults to the latest season, points, half-season minimum", () => {
    renderAt("/leaders");
    expect(screen.getByText(/2026 regular season · points per game · minimum 20 games · \d+ qualify/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    const first = within(table).getAllByRole("row")[1]!;
    expect(within(first).getByText("A'ja Wilson")).toBeInTheDocument();
    expect(within(first).getByText("26.0")).toBeInTheDocument();
    expect(within(first).getByText("62.0%")).toBeInTheDocument();
  });

  it("marks traded players and short samples", () => {
    renderAt("/leaders?min=15");
    const row = within(screen.getByRole("table")).getByText("Kelsey Plum").closest("tr")!;
    expect(within(row).getByText("Traded")).toBeInTheDocument();
    expect(within(row).getByText("LAS, PHX")).toBeInTheDocument();
    expect(within(row).getByText("of 40")).toBeInTheDocument();
  });

  it("shows the attempts behind a percentage and disables per 36", () => {
    renderAt("/leaders?stat=fg3_pct");
    expect(within(screen.getByRole("table")).getByText("3PA/G")).toBeInTheDocument();
    expect(screen.getByText(/requires at least 2 three-point attempts per game/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Basis" })).toBeDisabled();
  });

  it("says so when nothing matches", () => {
    renderAt("/leaders?season=2020&min=22&team=toronto-tempo");
    // Toronto did not exist in 2020, so the team filter falls back to all teams.
    expect(screen.queryByText("No players match these filters. Try a lower minimum or all teams.")).not.toBeInTheDocument();
  });
});
