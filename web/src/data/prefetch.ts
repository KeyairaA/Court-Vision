import type { ArtifactName } from "./contract";
import { loadArtifact } from "./load";

/**
 * The artifacts each route needs. Fetching them as soon as the app boots,
 * instead of after the route's code chunk arrives and mounts, removes a full
 * round trip from the data-heavy pages.
 */
const ROUTE_ARTIFACTS: [RegExp, ArtifactName[]][] = [
  [/^\/$/, ["league-trends"]],
  [/^\/leaders/, ["league-trends", "player-seasons", "franchises"]],
  [/^\/players/, ["league-trends", "player-seasons", "careers", "franchises"]],
  [/^\/compare/, ["league-trends", "player-seasons", "careers", "franchises"]],
  [/^\/how-it-works/, ["league-trends", "franchises"]],
];

export function artifactsFor(pathname: string): ArtifactName[] {
  return ["manifest", ...(ROUTE_ARTIFACTS.find(([re]) => re.test(pathname))?.[1] ?? [])];
}

/** Warm the cache for a path. Failures are left for the page to report. */
export function prefetchRoute(pathname: string): void {
  for (const name of artifactsFor(pathname)) void loadArtifact(name).catch(() => undefined);
}
