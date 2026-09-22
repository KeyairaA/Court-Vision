/**
 * Axis ticks on round numbers that bracket the data. Steps are 1, 2, 2.5 or 5
 * times a power of ten, chosen to give about `target` ticks.
 */
export function niceTicks(min: number, max: number, target = 5): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(target - 1, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { domain: [lo, hi], ticks };
}
