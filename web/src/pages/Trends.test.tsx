import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import manifest from "../../../data/v1/manifest.json";
import trends from "../../../data/v1/league-trends.json";
import type { LeagueSeasonRecord, Manifest } from "../data/contract";
import { TrendsView } from "./Trends";

function renderAt(url: string) {
  const router = createMemoryRouter(
    [{ path: "/", element: <TrendsView manifest={manifest as Manifest} trends={trends as LeagueSeasonRecord[]} /> }],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

describe("League trends, with the published data", () => {
  it("shows the latest season against the first", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "League trends" })).toBeInTheDocument();
    expect(screen.getByText("Three-point volume rose 44% from 2017 to 2026. Accuracy stayed flat.")).toBeInTheDocument();
    expect(screen.getByText("37.1%", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("+11.4 pts vs 2017")).toBeInTheDocument();
    expect(screen.getByText("87.1", { selector: "div" })).toBeInTheDocument();
  });

  it("warns that the latest scoring jump came with expansion", () => {
    renderAt("/");
    expect(screen.getByText(/2026 scoring jump to 87\.1 arrived with 2 expansion teams/)).toBeInTheDocument();
  });

  it("marks caveat seasons in the table", () => {
    renderAt("/");
    const table = screen.getByRole("table");
    const bubble = within(table).getByRole("rowheader", { name: /2020/ }).closest("tr")!;
    expect(within(bubble).getByText("22 games")).toBeInTheDocument();
  });

  it("follows the season range in the URL", () => {
    renderAt("/?from=2020&to=2024");
    expect(screen.getByText("Regular season · 2020 to 2024")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(6);
  });
});
