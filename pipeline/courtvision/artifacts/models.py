"""The published artifact contract, as Pydantic models.

ONE SOURCE, THREE ENFORCEMENTS
------------------------------
These models are the only definition of what the artifacts contain. From them:

  1. The build validates every artifact before writing it. A field the
     frontend relies on cannot silently disappear or change type, because the
     build fails first.
  2. `courtvision schemas` generates the JSON Schemas in `schemas/`. They are
     committed, and CI fails if the committed files differ from what these
     models generate, so the published contract cannot drift from the code.
  3. TypeScript types are generated from those JSON Schemas, and CI fails if
     the committed types are stale. The frontend imports those types, so a
     renamed field becomes a TypeScript compile error rather than a blank chart.

Every model forbids extra fields. An artifact carrying something the contract
does not mention is a bug in the build, not a bonus.

NULLABILITY IS DELIBERATE
-------------------------
Rates are nullable because a zero denominator yields null, never Infinity: a
player with no three-point attempts has no three-point percentage. Counting
stats are never null. Per-36 rates are nullable because a player can log a game
with zero recorded minutes; the 2026 source contains eleven such rows.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from courtvision import config

Rate = float | None


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------ player seasons --


class PlayerSeasonRecord(_Strict):
    """One player's regular season. Totals, per-game, per-36 and rates."""

    season: int = Field(ge=1997)
    player_id: int
    player_name: str
    team_id: int = Field(description="Provider team identity. Primary team if traded.")
    team_abbreviation: str = Field(description="Label current in this season, e.g. PHO in 2024.")
    franchise_slug: str = Field(description="Stable franchise key; use this to group.")
    is_multi_team: bool
    teams: list[str] = Field(description="Every team played for, in order.")
    gp: int = Field(ge=1)
    min: float = Field(ge=0)
    pts: float = Field(ge=0)
    reb: float = Field(ge=0)
    oreb: float = Field(ge=0)
    dreb: float = Field(ge=0)
    ast: float = Field(ge=0)
    stl: float = Field(ge=0)
    blk: float = Field(ge=0)
    tov: float = Field(ge=0)
    fgm: float = Field(ge=0)
    fga: float = Field(ge=0)
    fg3m: float = Field(ge=0)
    fg3a: float = Field(ge=0)
    ftm: float = Field(ge=0)
    fta: float = Field(ge=0)
    fg_pct: Rate
    fg3_pct: Rate
    ft_pct: Rate
    ts_pct: Rate
    efg_pct: Rate
    fg3a_rate: Rate
    ftr: Rate
    ast_to: Rate
    min_pg: float
    pts_pg: float
    reb_pg: float
    ast_pg: float
    stl_pg: float
    blk_pg: float
    tov_pg: float
    pts_per36: Rate
    reb_per36: Rate
    ast_per36: Rate
    stl_per36: Rate
    blk_per36: Rate
    tov_per36: Rate


# ------------------------------------------------------------------- careers --


class CareerRecord(_Strict):
    """Games-weighted totals across the published window only."""

    player_id: int
    player_name: str
    first_season: int
    last_season: int
    seasons_played: int = Field(ge=1)
    gp: int = Field(ge=1)
    min: float = Field(ge=0)
    pts: float = Field(ge=0)
    reb: float = Field(ge=0)
    ast: float = Field(ge=0)
    stl: float = Field(ge=0)
    blk: float = Field(ge=0)
    tov: float = Field(ge=0)
    fg_pct: Rate
    fg3_pct: Rate
    ft_pct: Rate
    ts_pct: Rate
    efg_pct: Rate
    fg3a_rate: Rate
    ftr: Rate
    ast_to: Rate
    min_pg: float
    pts_pg: float
    reb_pg: float
    ast_pg: float
    stl_pg: float
    blk_pg: float
    tov_pg: float
    pts_per36: Rate
    reb_per36: Rate
    ast_per36: Rate


# -------------------------------------------------------------- league trends --


class LeagueSeasonRecord(_Strict):
    """League-wide totals per team-game, computed from team rows."""

    season: int
    teams: int = Field(ge=1)
    players: int = Field(ge=1)
    games: int = Field(ge=1)
    games_per_team: float | None
    pts_per_team_game: float
    reb_per_team_game: float
    ast_per_team_game: float
    tov_per_team_game: float
    fg3a_per_team_game: float
    fta_per_team_game: float
    fg_pct: Rate
    fg3_pct: Rate
    ft_pct: Rate
    ts_pct: Rate
    efg_pct: Rate
    fg3a_rate: Rate
    ftr: Rate
    confound: str | None = Field(description="Structural caveat for this season, if any.")
    label_change: str | None = Field(description="A team label that changes this season.")


# ---------------------------------------------------------------- franchises --


class FranchiseIdentityRecord(_Strict):
    abbreviation: str
    name: str
    city: str
    first_season: int
    last_season: int | None
    verified: bool


class FranchiseRecord(_Strict):
    """A provider identity. `eras` separates unrelated franchises sharing an ID."""

    team_id: int
    slug: str
    eras: list[list[FranchiseIdentityRecord]] = Field(
        description="Continuous eras. Never connect history across two eras."
    )


# ------------------------------------------------------------------ manifest --


class SourceFile(_Strict):
    season: int
    url: str
    last_modified: str | None
    etag: str | None
    sha256: str
    rows: int
    filled_games: int
    fill_source: str | None


class Source(_Strict):
    name: str
    homepage: str
    latest_published_at: str | None
    files: list[SourceFile]


class Window(_Strict):
    first: int
    last: int
    seasons: list[int]


class Methodology(_Strict):
    true_shooting_ft_coefficient: float
    per_minutes_base: int
    season_labels_verified: bool
    league_averages: str
    careers: str


class AbbreviationDrift(_Strict):
    team_id: int
    season: int
    registry: str
    observed: str


class FranchiseReport(_Strict):
    clean: bool
    unknown_team_ids: dict[str, str]
    abbreviation_drift: list[AbbreviationDrift]


class SeasonQuality(_Strict):
    games_played: int
    games_covered: int
    coverage: float = Field(ge=0, le=1)
    complete: bool
    missing_games: int
    forfeits: int
    last_covered_date: str | None
    last_played_date: str | None
    team_games_reconciled: int
    filled_games: int
    fill_source: str | None


class Counts(_Strict):
    player_seasons: int
    players: int
    per_season: dict[str, int]


class ArtifactEntry(_Strict):
    path: str
    bytes: int
    sha256: str


class Manifest(_Strict):
    """Provenance and methodology. The frontend reads this first."""

    schema_version: str
    generated_at: str = Field(description="When the build ran.")
    content_fingerprint: str | None = Field(
        default=None,
        description="Hash of the data artifacts. Unchanged data, unchanged fingerprint.",
    )
    source: Source
    window: Window
    season_type: str
    methodology: Methodology
    confounded_seasons: dict[str, str]
    label_changes: dict[str, str]
    franchise_report: FranchiseReport
    quality: dict[str, SeasonQuality]
    partial_seasons: list[int]
    counts: Counts
    artifacts: dict[str, ArtifactEntry] | None = Field(
        default=None, description="Present in the written file; absent before writing."
    )


# ------------------------------------------------------------------ registry --

ARTIFACT_TYPES: dict[str, type | object] = {
    "manifest": Manifest,
    "league-trends": list[LeagueSeasonRecord],
    "player-seasons": list[PlayerSeasonRecord],
    "careers": list[CareerRecord],
    "franchises": list[FranchiseRecord],
}

ADAPTERS: dict[str, TypeAdapter] = {name: TypeAdapter(t) for name, t in ARTIFACT_TYPES.items()}

SCHEMA_TITLES: dict[str, str] = {
    "manifest": "Manifest",
    "league-trends": "LeagueTrends",
    "player-seasons": "PlayerSeasons",
    "careers": "Careers",
    "franchises": "Franchises",
}


def validate_artifact(name: str, payload: object) -> None:
    """Raise pydantic.ValidationError if `payload` breaks the contract."""
    ADAPTERS[name].validate_python(payload)


def _strip_field_titles(node: object) -> object:
    """Remove the auto-generated title Pydantic puts on every field.

    Left in, each field title becomes its own exported TypeScript alias, and
    they collide: the manifest's `counts.player_seasons` field is titled
    "Player Seasons", which generated `export type PlayerSeasons = number` and
    silently shadowed the real `PlayerSeasons` artifact type. Titles are kept
    only on models ($defs) and on each schema's root, which are real names.
    """
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key == "properties" and isinstance(value, dict):
                out[key] = {
                    prop: {k: _strip_field_titles(v) for k, v in spec.items() if k != "title"}
                    for prop, spec in value.items()
                }
            else:
                out[key] = _strip_field_titles(value)
        return out
    if isinstance(node, list):
        return [_strip_field_titles(v) for v in node]
    return node


def json_schemas() -> dict[str, dict]:
    """JSON Schema for every artifact, keyed by artifact name."""
    out = {}
    for name, adapter in ADAPTERS.items():
        schema = _strip_field_titles(adapter.json_schema(mode="serialization"))
        schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": f"https://court-vision/schemas/{config.ARTIFACT_SCHEMA_VERSION}/{name}.schema.json",
            "title": SCHEMA_TITLES[name],
            **{k: v for k, v in schema.items() if k != "title"},
        }
        out[name] = schema
    return out
