import type { FranchiseRecord } from "../../data/contract";
import { useWidth } from "./useWidth";

interface Segment {
  label: string;
  from: number;
  /** Exclusive end year. */
  to: number;
  future: boolean;
}

export interface TimelineRow {
  slug: string;
  name: string;
  eras: Segment[][];
  note: string;
}

/**
 * Franchises whose history is not a single label: relabels, relocations and
 * lineage breaks. Built from franchises.json, so a new relocation shows up
 * here without anyone editing the page.
 */
export function timelineRows(franchises: FranchiseRecord[], windowLast: number): TimelineRow[] {
  return franchises
    .filter((f) => f.eras.length > 1 || (f.eras[0]?.length ?? 0) > 1)
    .map((f) => {
      const eras = f.eras.map((era) =>
        era.map((id) => ({
          label: id.abbreviation,
          from: id.first_season,
          to: (id.last_season ?? Math.max(id.first_season, windowLast)) + 1,
          future: id.first_season > windowLast,
        })),
      );
      const all = f.eras.flat();
      // Named as the franchise is in the window's last season, so a move that has not happened yet reads as news, not as the title.
      const current = all.find((id) => windowLast >= id.first_season && (id.last_season === null || windowLast <= id.last_season)) ?? all.at(-1)!;
      let note: string;
      if (f.eras.length > 1) {
        const ended = f.eras[0]!.at(-1)!;
        const reborn = f.eras[1]![0]!;
        note = `The ${ended.first_season === ended.last_season ? ended.first_season : `${f.eras[0]![0]!.first_season} to ${ended.last_season}`} team folded. The ${reborn.first_season} team reuses its ID but is a new franchise, so their histories are never joined.`;
      } else {
        const moves = all.slice(1).map((id, i) => {
          const prev = all[i]!;
          const what = prev.name === id.name ? `label changes from ${prev.abbreviation} to ${id.abbreviation}` : `becomes the ${id.name}`;
          return `${id.first_season > windowLast ? "In" : "From"} ${id.first_season}, ${what}`;
        });
        const origin = all[0]!.name === current.name ? `The ${current.name} since ${all[0]!.first_season}.` : `Began as the ${all[0]!.name} in ${all[0]!.first_season}.`;
        note = `${origin} ${moves.join(". ")}. One franchise, one continuous line.`;
      }
      return { slug: f.slug, name: current.name, eras, note };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function FranchiseTimeline({ rows, windowFirst, windowLast }: { rows: TimelineRow[]; windowFirst: number; windowLast: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(760);
  const narrow = width < 560;
  const years = rows.flatMap((r) => r.eras.flat().flatMap((s) => [s.from, s.to]));
  const y0 = Math.min(...years, windowFirst);
  const y1 = Math.max(...years, windowLast + 1);
  const left = narrow ? 0 : 170;
  const right = 8;
  const innerW = Math.max(width - left - right, 40);
  const X = (y: number) => left + ((y - y0) / (y1 - y0)) * innerW;
  const rowH = narrow ? 96 : 66;
  const top = 26;
  const height = top + rows.length * rowH + 20;
  const ticks = [2000, 2010, 2020].filter((t) => t > y0 && t < y1);

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label="Franchise timelines: relabels, relocations and lineage breaks." className="block font-sans">
        <rect x={X(windowFirst)} y={top - 6} width={X(windowLast + 1) - X(windowFirst)} height={height - top - 14} style={{ fill: "var(--color-band)" }} />
        <text x={narrow ? X(windowLast + 1) : (X(windowFirst) + X(windowLast + 1)) / 2} y={14} textAnchor={narrow ? "end" : "middle"} className="fill-ink-2 text-xs font-semibold">
          Court Vision window, {windowFirst} to {windowLast}
        </text>
        {ticks.map((t) => (
          <text key={t} x={X(t)} y={height - 4} textAnchor="middle" className="tabular fill-ink-2 text-xs">
            {t}
          </text>
        ))}
        {rows.map((r, k) => {
          const base = top + k * rowH;
          const lineY = base + (narrow ? 44 : 18);
          const segs = r.eras.flat();
          return (
            <g key={r.slug}>
              <text x={0} y={narrow ? base + 10 : lineY + 5} className="fill-ink text-sm font-bold">
                {r.name}
              </text>
              {segs.map((s) => (
                <g key={`${s.label}-${s.from}`}>
                  <line
                    x1={X(s.from) + 2}
                    x2={Math.max(X(s.to) - 2, X(s.from) + 4)}
                    y1={lineY}
                    y2={lineY}
                    style={{ stroke: s.future ? "var(--color-ink-2)" : "var(--color-ink)", strokeWidth: 6, strokeLinecap: "round", strokeDasharray: s.future ? "2 5" : undefined }}
                  />
                  <text x={(X(s.from) + X(s.to)) / 2} y={lineY - 9} textAnchor="middle" className="fill-ink text-xs font-bold">
                    {s.label}
                  </text>
                </g>
              ))}
              {r.eras.length > 1
                ? r.eras.slice(1).map((era, i) => {
                    const gapFrom = r.eras[i]!.at(-1)!.to;
                    const gapTo = era[0]!.from;
                    return (
                      <text key={gapTo} x={(X(gapFrom) + X(gapTo)) / 2} y={lineY + 4} textAnchor="middle" className="fill-accent-ink text-xs font-bold">
                        lineage break
                      </text>
                    );
                  })
                : null}
            </g>
          );
        })}
      </svg>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li key={r.slug} className="text-[15px] leading-normal text-ink">
            <strong className="font-bold">{r.name}.</strong> {r.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
