/* eslint-disable */
/**
 * GENERATED FILE. DO NOT EDIT.
 * Source: pipeline/courtvision/artifacts/models.py
 * Regenerate: `courtvision schemas` then `npm run generate --prefix schemas`
 */
// ---- careers.schema.json ----
export type Careers = CareerRecord[];

/**
 * Games-weighted totals across the published window only.
 */
export interface CareerRecord {
  ast: number;
  ast_per36: number | null;
  ast_pg: number;
  ast_to: number | null;
  blk: number;
  blk_pg: number;
  efg_pct: number | null;
  fg3_pct: number | null;
  fg3a_rate: number | null;
  fg_pct: number | null;
  first_season: number;
  ft_pct: number | null;
  ftr: number | null;
  gp: number;
  last_season: number;
  min: number;
  min_pg: number;
  player_id: number;
  player_name: string;
  pts: number;
  pts_per36: number | null;
  pts_pg: number;
  reb: number;
  reb_per36: number | null;
  reb_pg: number;
  seasons_played: number;
  stl: number;
  stl_pg: number;
  tov: number;
  tov_pg: number;
  ts_pct: number | null;
}

// ---- franchises.schema.json ----
export type Franchises = FranchiseRecord[];

/**
 * A provider identity. `eras` separates unrelated franchises sharing an ID.
 */
export interface FranchiseRecord {
  /**
   * Continuous eras. Never connect history across two eras.
   */
  eras: FranchiseIdentityRecord[][];
  slug: string;
  team_id: number;
}
export interface FranchiseIdentityRecord {
  abbreviation: string;
  city: string;
  first_season: number;
  last_season: number | null;
  name: string;
  verified: boolean;
}

// ---- league-trends.schema.json ----
export type LeagueTrends = LeagueSeasonRecord[];

/**
 * League-wide totals per team-game, computed from team rows.
 */
export interface LeagueSeasonRecord {
  ast_per_team_game: number;
  /**
   * Structural caveat for this season, if any.
   */
  confound: string | null;
  efg_pct: number | null;
  fg3_pct: number | null;
  fg3a_per_team_game: number;
  fg3a_rate: number | null;
  fg_pct: number | null;
  ft_pct: number | null;
  fta_per_team_game: number;
  ftr: number | null;
  games: number;
  games_per_team: number | null;
  /**
   * A team label that changes this season.
   */
  label_change: string | null;
  players: number;
  pts_per_team_game: number;
  reb_per_team_game: number;
  season: number;
  teams: number;
  tov_per_team_game: number;
  ts_pct: number | null;
}

// ---- manifest.schema.json ----
/**
 * Provenance and methodology. The frontend reads this first.
 */
export interface Manifest {
  /**
   * Present in the written file; absent before writing.
   */
  artifacts?: {
    [k: string]: ArtifactEntry | undefined;
  } | null;
  confounded_seasons: {
    [k: string]: string | undefined;
  };
  /**
   * Hash of the data artifacts. Unchanged data, unchanged fingerprint.
   */
  content_fingerprint?: string | null;
  counts: Counts;
  franchise_report: FranchiseReport;
  /**
   * When the build ran.
   */
  generated_at: string;
  label_changes: {
    [k: string]: string | undefined;
  };
  methodology: Methodology;
  partial_seasons: number[];
  quality: {
    [k: string]: SeasonQuality | undefined;
  };
  schema_version: string;
  season_type: string;
  source: Source;
  window: Window;
}
export interface ArtifactEntry {
  bytes: number;
  path: string;
  sha256: string;
}
export interface Counts {
  per_season: {
    [k: string]: number | undefined;
  };
  player_seasons: number;
  players: number;
}
export interface FranchiseReport {
  abbreviation_drift: AbbreviationDrift[];
  clean: boolean;
  unknown_team_ids: {
    [k: string]: string | undefined;
  };
}
export interface AbbreviationDrift {
  observed: string;
  registry: string;
  season: number;
  team_id: number;
}
export interface Methodology {
  careers: string;
  league_averages: string;
  per_minutes_base: number;
  season_labels_verified: boolean;
  true_shooting_ft_coefficient: number;
}
export interface SeasonQuality {
  complete: boolean;
  coverage: number;
  fill_source: string | null;
  filled_games: number;
  forfeits: number;
  games_covered: number;
  games_played: number;
  last_covered_date: string | null;
  last_played_date: string | null;
  missing_games: number;
  team_games_reconciled: number;
}
export interface Source {
  files: SourceFile[];
  homepage: string;
  latest_published_at: string | null;
  name: string;
}
export interface SourceFile {
  etag: string | null;
  fill_source: string | null;
  filled_games: number;
  last_modified: string | null;
  rows: number;
  season: number;
  sha256: string;
  url: string;
}
export interface Window {
  first: number;
  last: number;
  seasons: number[];
}

// ---- player-seasons.schema.json ----
export type PlayerSeasons = PlayerSeasonRecord[];

/**
 * One player's regular season. Totals, per-game, per-36 and rates.
 */
export interface PlayerSeasonRecord {
  ast: number;
  ast_per36: number | null;
  ast_pg: number;
  ast_to: number | null;
  blk: number;
  blk_per36: number | null;
  blk_pg: number;
  dreb: number;
  efg_pct: number | null;
  fg3_pct: number | null;
  fg3a: number;
  fg3a_rate: number | null;
  fg3m: number;
  fg_pct: number | null;
  fga: number;
  fgm: number;
  /**
   * Stable franchise key; use this to group.
   */
  franchise_slug: string;
  ft_pct: number | null;
  fta: number;
  ftm: number;
  ftr: number | null;
  gp: number;
  is_multi_team: boolean;
  min: number;
  min_pg: number;
  oreb: number;
  player_id: number;
  player_name: string;
  pts: number;
  pts_per36: number | null;
  pts_pg: number;
  reb: number;
  reb_per36: number | null;
  reb_pg: number;
  season: number;
  stl: number;
  stl_per36: number | null;
  stl_pg: number;
  /**
   * Label current in this season, e.g. PHO in 2024.
   */
  team_abbreviation: string;
  /**
   * Provider team identity. Primary team if traded.
   */
  team_id: number;
  /**
   * Every team played for, in order.
   */
  teams: string[];
  tov: number;
  tov_per36: number | null;
  tov_pg: number;
  ts_pct: number | null;
}

/** Artifact file name (without .json) to its type. */
export interface ArtifactTypes {
  "careers": Careers;
  "franchises": Franchises;
  "league-trends": LeagueTrends;
  "manifest": Manifest;
  "player-seasons": PlayerSeasons;
}

export type ArtifactName = keyof ArtifactTypes;
