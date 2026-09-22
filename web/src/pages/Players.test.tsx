import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import careers from "../../../data/v1/careers.json";
import franchises from "../../../data/v1/franchises.json";
import trends from "../../../data/v1/league-trends.json";
import manifest from "../../../data/v1/manifest.json";
import players from "../../../data/v1/player-seasons.json";
import type { CareerRecord, FranchiseRecord, LeagueSeasonRecord, Manifest, PlayerSeasonRecord } from "../data/contract";
import { PlayerProfile, PlayersIndex } from "./Players";
import { useParams } from "react-router";

const data = {
  manifest: manifest as Manifest,
  trends: trends as LeagueSeasonRecord[],
  players: players as PlayerSeasonRecord[],
  careers: careers as CareerRecord[],
  franchises: franchises as FranchiseRecord[],
};

function Profile() {
  const { playerId } = useParams();
  return <PlayerProfile {...data} playerId={Number(playerId)} />;
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: "/players", element: <PlayersIndex {...data} /> },
      { path: "/players/:playerId", element: <Profile /> },
    ],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

const row = (season: string) => within(screen.getByRole("table")).getByRole("rowheader", { name: new RegExp(`^${season}`) }).closest("tr")! as HTMLElement;

describe("Player profile, with the published data", () => {
  it("shows A'ja Wilson's career and seasons", () => {
    renderAt("/players/1628932");
    expect(screen.getByRole("heading", { level: 1, name: "A'ja Wilson" })).toBeInTheDocument();
    expect(screen.getByText("Las Vegas Aces · 2018 to 2026 · every season with one franchise")).toBeInTheDocument();
    expect(screen.getByText("9 seasons, 2018 to 2026")).toBeInTheDocument();
    expect(within(row("Career")).getByText("304")).toBeInTheDocument();
    expect(screen.getByText("2026: 26.0")).toBeInTheDocument();
    expect(within(row("2024")).getByText("26.9")).toBeInTheDocument();
  });

  it("tells no attempts apart from no makes", () => {
    renderAt("/players/1628932");
    expect(within(row("2018")).getByText("n/a")).toBeInTheDocument();
    expect(within(row("2019")).getByText("0.0%")).toBeInTheDocument();
  });

  it("marks a short season so it does not read as a slump", () => {
    const { container } = renderAt("/players/1642286");
    expect(within(row("2025")).getByText("/ 44")).toBeInTheDocument();
    expect(container.querySelectorAll("circle[data-hollow]")).toHaveLength(1);
    expect(screen.getByText(/Open circles: a season with under half of the team's games/)).toBeInTheDocument();
  });

  it("says when a player missed a season instead of skipping it", () => {
    renderAt("/players/1627668");
    expect(within(row("2019")).getByText("Did not play")).toBeInTheDocument();
    expect(screen.getByText(/Missed 2019, so the line breaks there/)).toBeInTheDocument();
  });

  it("handles an unknown player", () => {
    renderAt("/players/12345");
    expect(screen.getByRole("heading", { level: 1, name: "No such player" })).toBeInTheDocument();
  });
});

describe("Players index", () => {
  it("finds a player and opens her profile from the keyboard", () => {
    renderAt("/players");
    const input = screen.getByRole("combobox", { name: /search players/i });
    fireEvent.change(input, { target: { value: "caitlin" } });
    expect(screen.getByRole("option", { name: /Caitlin Clark/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("heading", { level: 1, name: "Caitlin Clark" })).toBeInTheDocument();
  });

  it("lists the latest season's top scorers", () => {
    renderAt("/players");
    expect(screen.getByRole("link", { name: /A'ja Wilson/ })).toHaveAttribute("href", "/players/1628932");
  });
});
