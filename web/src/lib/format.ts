/**
 * Number formatting. Every nullable rate goes through here, and null always
 * renders as NA, never as 0: a player with no three-point attempts has no
 * three-point percentage, which is not the same as shooting 0%.
 */
export const NA = "n/a";

export function fixed(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? NA : value.toFixed(digits);
}

/** A 0 to 1 fraction as a percentage: 0.371 -> "37.1%". */
export function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? NA : `${(value * 100).toFixed(digits)}%`;
}

/** Signed change with an optional unit: +11.4, -0.3, +0.0 stays "+0.0". */
export function signed(delta: number, digits = 1): string {
  const text = Math.abs(delta).toFixed(digits);
  return delta < 0 && Number(text) !== 0 ? `-${text}` : `+${text}`;
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DATE_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-09-20T17:26:10+00:00" -> "Sep 20, 2026". Dates are shown in UTC so every visitor sees the same day. */
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? null : DATE.format(date);
}

export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? null : DATE_SHORT.format(date);
}

/** Games per team with a forfeit-adjusted fraction shown only when real: 34 or 33.8. */
export function gamesPerTeam(value: number | null): string {
  if (value === null) return NA;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
