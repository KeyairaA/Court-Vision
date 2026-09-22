import type { FranchiseRecord } from "../data/contract";

export interface FranchiseOption {
  slug: string;
  name: string;
}

/** The identity a franchise used in `season`, or undefined if it did not play. */
export function identityIn(franchise: FranchiseRecord, season: number) {
  for (const era of franchise.eras) {
    for (const id of era) {
      if (season >= id.first_season && (id.last_season === null || season <= id.last_season)) return id;
    }
  }
  return undefined;
}

/** Franchises that played in `season`, named as they were that season. */
export function franchisesIn(franchises: FranchiseRecord[], season: number): FranchiseOption[] {
  return franchises
    .flatMap((f) => {
      const id = identityIn(f, season);
      return id ? [{ slug: f.slug, name: id.name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a season's team label to its franchise. Labels are only unique
 * within a season (PHO became PHX; a relocated team can hand its old label to
 * someone else), so the season is part of the key.
 */
export function labelResolver(franchises: FranchiseRecord[]) {
  const cache = new Map<string, string | undefined>();
  return (label: string, season: number): string | undefined => {
    const key = `${season}:${label}`;
    if (!cache.has(key)) {
      const hit = franchises.find((f) => identityIn(f, season)?.abbreviation === label);
      cache.set(key, hit?.slug);
    }
    return cache.get(key);
  };
}
