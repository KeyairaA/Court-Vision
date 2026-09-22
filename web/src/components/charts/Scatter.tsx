import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { niceTicks } from "../../lib/ticks";
import type { TooltipContent } from "./LineChart";
import { useWidth } from "./useWidth";

export interface ScatterPoint {
  id: string | number;
  x: number;
  y: number;
  /** Direct label text; only points listed in `labelled` get one. */
  label: string;
  /** Open marker: the point rests on a small sample. */
  hollow?: boolean;
}

interface Props {
  points: ScatterPoint[];
  height: number;
  label: string;
  xLabel: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  labelled: Set<ScatterPoint["id"]>;
  reference?: { y: number; label: string };
  tooltip: (p: ScatterPoint) => TooltipContent;
  color?: string;
}

/**
 * Dot plot for two measures of the same players. Direct labels are placed
 * greedily and skipped rather than drawn over each other; every point is
 * still reachable by hover, touch and the arrow keys.
 */
export function Scatter({ points, height, label, xLabel, xFormat = String, yFormat = String, labelled, reference, tooltip, color = "var(--color-series-2)" }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const narrow = width < 520;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y).concat(reference ? [reference.y] : []);
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), narrow ? 4 : 6);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), 5);

  const left = narrow ? 40 : 48;
  const right = 16;
  const top = 16;
  const bottom = 46;
  const innerW = Math.max(width - left - right, 10);
  const innerH = height - top - bottom;
  const px = (v: number) => left + ((v - xt.domain[0]) / (xt.domain[1] - xt.domain[0] || 1)) * innerW;
  const py = (v: number) => top + ((yt.domain[1] - v) / (yt.domain[1] - yt.domain[0] || 1)) * innerH;

  // Greedy label placement: right of the point, or left near the edge; skip on overlap.
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = points.map((p) => ({ x0: px(p.x) - 7, x1: px(p.x) + 7, y0: py(p.y) - 7, y1: py(p.y) + 7 }));
  const labels = points.flatMap((p, i) => {
    if (!labelled.has(p.id)) return [];
    const w = p.label.length * 6.6 + 4;
    const toLeft = px(p.x) + 10 + w > left + innerW;
    const x0 = toLeft ? px(p.x) - 10 - w : px(p.x) + 10;
    const box = { x0, x1: x0 + w, y0: py(p.y) - 8, y1: py(p.y) + 8 };
    const hit = boxes.some((b, j) => j !== i && b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0);
    if (hit) return [];
    boxes.push(box);
    return [{ x: toLeft ? box.x1 : box.x0, y: py(p.y) + 4, text: p.label, anchor: toLeft ? "end" : "start" }];
  });

  const nearest = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = -1;
    let dist = Infinity;
    points.forEach((p, i) => {
      const d = (px(p.x) - mx) ** 2 + (py(p.y) - my) ** 2;
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActive(dist < 40 ** 2 ? best : null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(Math.max((i ?? (d > 0 ? -1 : points.length)) + d, 0), points.length - 1));
    } else if (e.key === "Escape") setActive(null);
  };

  const current = active !== null ? points[active] : undefined;
  const tip = current ? tooltip(current) : null;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={`${label} Use the arrow keys to read each player in rank order.`}
      aria-valuemin={1}
      aria-valuemax={points.length}
      aria-valuenow={(active ?? 0) + 1}
      aria-valuetext={tip ? [tip.title, ...tip.rows.map((r) => r.text)].join(". ") : "No player selected"}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      className="relative w-full rounded-sm"
    >
      <svg width={width} height={height} role="img" aria-labelledby={titleId} className="block touch-pan-y overflow-visible font-sans">
        <title id={titleId}>{label}</title>
        {yt.ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + innerW} y1={py(t)} y2={py(t)} style={{ stroke: "var(--color-grid)", strokeWidth: 1 }} />
            <text x={left - 8} y={py(t) + 4} textAnchor="end" className="tabular fill-ink-2 text-xs">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xt.ticks.map((t) => (
          <text key={t} x={px(t)} y={top + innerH + 20} textAnchor="middle" className="tabular fill-ink-2 text-xs">
            {xFormat(t)}
          </text>
        ))}
        <text x={left + innerW / 2} y={height - 4} textAnchor="middle" className="fill-ink-2 text-xs font-semibold">
          {xLabel}
        </text>
        {reference ? (
          <g>
            <line x1={left} x2={left + innerW} y1={py(reference.y)} y2={py(reference.y)} style={{ stroke: "var(--color-ink-2)", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <text x={left + innerW - 2} y={py(reference.y) - 6} textAnchor="end" className="fill-ink-2 text-xs">
              {reference.label}
            </text>
          </g>
        ) : null}
        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={px(p.x)}
            cy={py(p.y)}
            r={active === i ? 7 : 5.5}
            data-hollow={p.hollow || undefined}
            style={p.hollow ? { fill: "var(--color-card)", stroke: color, strokeWidth: 2 } : { fill: color, stroke: "var(--color-card)", strokeWidth: 2 }}
          />
        ))}
        {labels.map((l) => (
          <text key={l.text} x={l.x} y={l.y} textAnchor={l.anchor as "start" | "end"} className="fill-ink text-xs font-semibold">
            {l.text}
          </text>
        ))}
        <rect x={left} y={top} width={innerW} height={innerH} fill="transparent" onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)} />
      </svg>
      {tip && current ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 min-w-48 rounded border border-line bg-card px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
          style={{
            // Below the point in the top half of the plot, above it otherwise, so the point itself stays visible.
            top: py(current.y) < top + innerH / 2 ? py(current.y) + 14 : undefined,
            bottom: py(current.y) < top + innerH / 2 ? undefined : height - py(current.y) + 14,
            left: px(current.x) > width * 0.6 ? undefined : px(current.x) + 16,
            right: px(current.x) > width * 0.6 ? width - px(current.x) + 16 : undefined,
          }}
        >
          <div className="mb-1 font-bold text-ink">{tip.title}</div>
          {tip.rows.map((r) => (
            <div key={r.text} className="tabular text-ink">
              {r.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
