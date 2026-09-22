import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { niceTicks } from "../../lib/ticks";
import { useWidth } from "./useWidth";

export interface LineSeries {
  id: string;
  label: string;
  /** A CSS color, normally a theme variable such as var(--color-series-1). */
  color: string;
  values: (number | null)[];
  /** Open markers for points that rest on a small sample (short seasons). */
  hollow?: boolean[];
  /** Text drawn at the end of the line, in ink. Omit to rely on the legend. */
  endLabel?: string;
}

export interface ChartBand {
  from: number;
  to: number;
  label?: string;
  tone: "band" | "expansion";
}

export interface TooltipContent {
  title: string;
  rows: { color?: string; text: string }[];
}

interface Props {
  x: number[];
  series: LineSeries[];
  height: number;
  /** Accessible summary. The page also carries a table with every value. */
  label: string;
  yFormat?: (v: number) => string;
  ticks?: number[];
  bands?: ChartBand[];
  tooltip?: (index: number) => TooltipContent;
  endLabelWidth?: number;
}

const MAX_BAND_HALF = 34;
const BAND_FILL = { band: "var(--color-band)", expansion: "var(--color-band-expansion)" } as const;

/**
 * Line chart drawn as plain SVG at its real pixel width.
 *
 * Follows the Court Vision chart rules: one y axis; 2px lines; markers with a
 * surface ring; a null value breaks the line instead of bridging a season with
 * no data; text in ink, never in the series color; caveat seasons shaded and
 * labeled on the chart itself. Hover, touch and arrow keys all drive the same
 * crosshair and tooltip.
 */
export function LineChart({ x, series, height, label, yFormat = String, ticks: givenTicks, bands = [], tooltip, endLabelWidth }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  const narrow = width < 520;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const { domain, ticks } = givenTicks
    ? { domain: [givenTicks[0] ?? 0, givenTicks.at(-1) ?? 1] as [number, number], ticks: givenTicks }
    : niceTicks(Math.min(...all), Math.max(...all), narrow ? 4 : 5);

  const hasEndLabels = series.some((s) => s.endLabel);
  const right = hasEndLabels ? (endLabelWidth ?? (narrow ? 50 : 120)) : 16;
  const left = narrow ? 38 : 46;
  const top = bands.some((b) => b.label) ? 34 : 14;
  const bottom = 32;
  const innerW = Math.max(width - left - right, 10);
  const innerH = height - top - bottom;
  const step = innerW / Math.max(x.length - 1, 1);
  const px = (i: number) => left + step * i;
  const py = (v: number) => top + ((domain[1] - v) / (domain[1] - domain[0] || 1)) * innerH;

  // A band covers its season's column, but never wider than MAX_BAND_HALF each
  // side (a three-season range would otherwise shade a third of the chart) and
  // never outside the plot, where it would spill over neighbouring content.
  const half = Math.min(step * 0.42, MAX_BAND_HALF);
  const bandShapes = bands.flatMap((b) => {
    const i0 = x.indexOf(b.from);
    const i1 = x.indexOf(b.to);
    if (i0 < 0 || i1 < 0) return [];
    const x0 = Math.max(px(i0) - half, left);
    const x1 = Math.min(px(i1) + half, left + innerW + half, width);
    return [{ ...b, x0, x1, center: (px(i0) + px(i1)) / 2 }];
  });
  const bandLabels = mergeLabels(
    bandShapes.filter((b) => b.label).map((b) => ({ x: b.center, text: b.label!, tone: b.tone })),
  );

  const pick = (clientX: number, rect: DOMRect) => {
    const i = Math.round((clientX - rect.left - left) / step);
    setActive(Math.min(Math.max(i, 0), x.length - 1));
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => pick(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect());
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setActive((i) => Math.min(Math.max((i ?? (d > 0 ? -1 : x.length)) + d, 0), x.length - 1));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const tip = active !== null && tooltip ? tooltip(active) : null;
  const tipLeft = active !== null && px(active) > width * 0.55;

  return (
    <div
      ref={ref}
      className="relative w-full rounded-sm"
      {...(tooltip
        ? {
            role: "slider",
            tabIndex: 0,
            "aria-label": `${label} Use the left and right arrow keys to read each season.`,
            "aria-valuemin": x[0],
            "aria-valuemax": x.at(-1),
            "aria-valuenow": x[active ?? x.length - 1],
            "aria-valuetext": valueText(tooltip(active ?? x.length - 1)),
            onKeyDown: onKey,
            onBlur: () => setActive(null),
          }
        : {})}
    >
      <svg width={width} height={height} role="img" aria-labelledby={titleId} className="block touch-pan-y overflow-visible font-sans">
        <title id={titleId}>{label}</title>
        {bandShapes.map((b) => (
          <rect key={`${b.x0}`} x={b.x0} y={top} width={b.x1 - b.x0} height={innerH} style={{ fill: BAND_FILL[b.tone] }} />
        ))}
        {bandLabels.map((l) => (
          <text key={`${l.x}-${l.text}`} x={l.x} y={top - 10} textAnchor="middle" className="fill-ink-2 text-xs font-semibold">
            {l.text}
          </text>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + innerW} y1={py(t)} y2={py(t)} style={{ stroke: "var(--color-grid)", strokeWidth: 1 }} />
            <text x={left - 10} y={py(t) + 4} textAnchor="end" className="tabular fill-ink-2 text-xs">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {x.map((v, i) => (
          <text key={v} x={px(i)} y={top + innerH + 22} textAnchor="middle" className="tabular fill-ink-2 text-xs">
            {narrow ? `’${String(v).slice(2)}` : v}
          </text>
        ))}
        {active !== null ? (
          <line
            x1={px(active)}
            x2={px(active)}
            y1={top}
            y2={top + innerH}
            style={{ stroke: "var(--color-ink-2)", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
        ) : null}
        {series.map((s) => (
          <SeriesMarks key={s.id} s={s} px={px} py={py} active={active} />
        ))}
        {series.map((s) => {
          const last = s.values.findLastIndex((v) => v !== null);
          const v = s.values[last];
          if (!s.endLabel || v === null || v === undefined) return null;
          const others = series.filter((o) => o !== s && o.endLabel).map((o) => o.values[o.values.findLastIndex((w) => w !== null)] ?? 0);
          const crowded = others.some((o) => Math.abs(py(o) - py(v)) < 16);
          const nudge = crowded ? (others.some((o) => o > v) ? 7 : -7) : 0;
          return (
            <text key={s.id} x={px(last) + 12} y={py(v) + 5 + nudge} className="tabular fill-ink text-sm font-bold">
              {s.endLabel}
            </text>
          );
        })}
        {tooltip ? (
          <rect
            x={left - step / 2}
            y={top}
            width={innerW + step}
            height={innerH}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          />
        ) : null}
      </svg>
      {tip && active !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 min-w-44 rounded border border-line bg-card px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
          style={{ top: top + 6, left: tipLeft ? undefined : px(active) + 14, right: tipLeft ? width - px(active) + 14 : undefined }}
        >
          <div className="mb-1 font-bold text-ink">{tip.title}</div>
          {tip.rows.map((r) => (
            <div key={r.text} className="tabular flex items-center gap-2 text-ink">
              {r.color ? <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: r.color }} /> : null}
              {r.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Band labels that would collide merge into one. Neighbouring expansion
 * seasons read "Expansion"; anything else joins its labels.
 */
export function mergeLabels(labels: { x: number; text: string; tone: ChartBand["tone"] }[]) {
  const width = (t: string) => t.length * 6.2 + 10;
  const out: typeof labels = [];
  for (const l of labels) {
    const prev = out.at(-1);
    if (prev && l.x - prev.x < (width(prev.text) + width(l.text)) / 2) {
      out[out.length - 1] = { x: (prev.x + l.x) / 2, text: prev.tone === "expansion" && l.tone === "expansion" ? "Expansion" : `${prev.text}, ${l.text}`, tone: l.tone };
    } else {
      out.push(l);
    }
  }
  return out;
}

function valueText(t: TooltipContent): string {
  return [t.title, ...t.rows.map((r) => r.text)].join(". ");
}

function SeriesMarks({ s, px, py, active }: { s: LineSeries; px: (i: number) => number; py: (v: number) => number; active: number | null }) {
  // Split into runs so a missing season breaks the line.
  const runs: string[] = [];
  let run: string[] = [];
  s.values.forEach((v, i) => {
    if (v === null) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
    } else {
      run.push(`${px(i).toFixed(1)},${py(v).toFixed(1)}`);
    }
  });
  if (run.length > 1) runs.push(run.join(" "));

  return (
    <g>
      {runs.map((points) => (
        <polyline key={points} points={points} fill="none" style={{ stroke: s.color, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} />
      ))}
      {s.values.map((v, i) => {
        if (v === null) return null;
        const hollow = s.hollow?.[i] ?? false;
        const r = active === i ? 6 : hollow ? 5 : 4.5;
        return (
          <circle
            key={i}
            cx={px(i)}
            cy={py(v)}
            r={r}
            data-hollow={hollow || undefined}
            style={hollow ? { fill: "var(--color-card)", stroke: s.color, strokeWidth: 2 } : { fill: s.color, stroke: "var(--color-card)", strokeWidth: 2 }}
          />
        );
      })}
    </g>
  );
}

export function Legend({ items }: { items: { color: string; label: string; hollow?: boolean }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-ink">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <svg width="28" height="12" aria-hidden="true">
            {item.hollow ? (
              <circle cx="14" cy="6" r="4.5" style={{ fill: "var(--color-card)", stroke: item.color, strokeWidth: 2 }} />
            ) : (
              <>
                <line x1="2" y1="6" x2="26" y2="6" style={{ stroke: item.color, strokeWidth: 2, strokeLinecap: "round" }} />
                <circle cx="14" cy="6" r="4.5" style={{ fill: item.color, stroke: "var(--color-card)", strokeWidth: 2 }} />
              </>
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
