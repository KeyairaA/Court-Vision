import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineChart, mergeLabels } from "./LineChart";

const x = [2018, 2019, 2020, 2021];

describe("LineChart", () => {
  it("breaks the line at a missing season instead of bridging it", () => {
    const { container } = render(
      <LineChart x={x} height={200} label="test" series={[{ id: "a", label: "A", color: "red", values: [1, 2, null, 4] }]} />,
    );
    // Runs of one point draw no line; the lone 2021 point is still a marker.
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("draws open markers for short seasons", () => {
    const { container } = render(
      <LineChart x={x} height={200} label="test" series={[{ id: "a", label: "A", color: "red", values: [1, 2, 3, 4], hollow: [false, true, false, false] }]} />,
    );
    expect(container.querySelectorAll("circle[data-hollow]")).toHaveLength(1);
  });

  it("reads each season from the keyboard", () => {
    render(
      <LineChart
        x={x}
        height={200}
        label="Points"
        series={[{ id: "a", label: "A", color: "red", values: [1, 2, 3, 4] }]}
        tooltip={(i) => ({ title: String(x[i]), rows: [{ text: `value ${i + 1}` }] })}
      />,
    );
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "2021");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "2020");
    expect(slider.getAttribute("aria-valuetext")).toBe("2020. value 3");
  });
});

describe("band labels", () => {
  it("merge when neighbouring expansion seasons would collide", () => {
    const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
    const { container } = render(
      <LineChart
        x={years}
        height={200}
        label="t"
        series={[{ id: "a", label: "A", color: "red", values: years.map((_, i) => i) }]}
        bands={[
          { from: 2025, to: 2025, label: "13 teams", tone: "expansion" },
          { from: 2026, to: 2026, label: "15 teams", tone: "expansion" },
        ]}
      />,
    );
    // jsdom has no layout, so the chart draws at its 640px fallback, where the labels still fit.
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["13 teams", "15 teams"]));
  });
});

describe("mergeLabels", () => {
  it("joins colliding expansion labels on a narrow chart", () => {
    const merged = mergeLabels([
      { x: 280, text: "13 teams", tone: "expansion" },
      { x: 310, text: "15 teams", tone: "expansion" },
    ]);
    expect(merged).toEqual([{ x: 295, text: "Expansion", tone: "expansion" }]);
  });

  it("keeps labels that fit apart", () => {
    expect(mergeLabels([
      { x: 100, text: "22 games", tone: "band" },
      { x: 300, text: "13 teams", tone: "expansion" },
    ])).toHaveLength(2);
  });
});

describe("band geometry", () => {
  it("stays inside the plot and keeps its size when only a few seasons are shown", () => {
    const { container } = render(
      <LineChart
        x={[2024, 2025, 2026]}
        height={200}
        label="t"
        series={[{ id: "a", label: "A", color: "red", values: [33.5, 36, 37.1], endLabel: "37.1%" }]}
        endLabelWidth={64}
        bands={[
          { from: 2025, to: 2025, label: "13 teams", tone: "expansion" },
          { from: 2026, to: 2026, label: "15 teams", tone: "expansion" },
        ]}
      />,
    );
    const svgWidth = Number(container.querySelector("svg")!.getAttribute("width"));
    for (const rect of container.querySelectorAll("rect[style*='band']")) {
      const left = Number(rect.getAttribute("x"));
      const w = Number(rect.getAttribute("width"));
      expect(left).toBeGreaterThanOrEqual(46);
      expect(left + w).toBeLessThanOrEqual(svgWidth);
      expect(w).toBeLessThanOrEqual(68);
    }
    expect(container.querySelectorAll("rect[style*='band']")).toHaveLength(2);
  });
});
