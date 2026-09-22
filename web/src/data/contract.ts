/**
 * The artifact contract, as generated from the pipeline's Pydantic models.
 *
 * Nothing here is hand-written: the types come from schemas/typescript,
 * which CI regenerates and diffs on every push. A renamed or retyped field
 * in the pipeline therefore fails `npm run typecheck` here, not at runtime.
 */
export type {
  Careers,
  CareerRecord,
  Franchises,
  FranchiseRecord,
  LeagueTrends,
  LeagueSeasonRecord,
  Manifest,
  PlayerSeasons,
  PlayerSeasonRecord,
  SeasonQuality,
} from "../../../schemas/typescript/artifacts";

import type { Careers, Franchises, LeagueTrends, Manifest, PlayerSeasons } from "../../../schemas/typescript/artifacts";

export interface ArtifactMap {
  manifest: Manifest;
  "league-trends": LeagueTrends;
  "player-seasons": PlayerSeasons;
  careers: Careers;
  franchises: Franchises;
}

export type ArtifactName = keyof ArtifactMap;

/** The artifact schema major version this build of the site understands. */
export const SUPPORTED_SCHEMA_MAJOR = 1;
