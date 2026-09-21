"""The canonical data contract.

NAMING
------
Columns are lowercase snake_case. The original uppercase layout (`PLAYER_ID`,
`Year`) was an artifact of `nba_api`'s response format rather than a decision.
The primary source is now the sportsdataverse mirror, which ships snake_case, so
the internal contract matches it and the adapter stays thin.

TEAM IDENTITY
-------------
`team_id` is the team key. `team_abbreviation` is a per-season display label and
must never be used as a join key. Two findings force this:

  - TEAM_ID 1611661317 carried PHO through 2024 and PHX from 2025, with no
    franchise change at all. The provider changed a string.
  - TEAM_ID 1611661327 was the original Portland Fire (2000-2002) and is also
    the 2026 expansion team. So team_id means "same provider identity", not
    "same franchise". See domain/franchise.py.

SEASON TYPE
-----------
One canonical spelling, defined once. Three have been seen in the wild:
`Regular Season` from the stats API, `regular-season` from the mirror, and `RS`
in the original notebook. The mismatch silently produced empty frames and blank
charts twice. Normalization happens in transform/aggregate.py; validation
happens here.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

SEASON_TYPE_REGULAR = "Regular Season"
SEASON_TYPE_PLAYOFFS = "Playoffs"
SEASON_TYPES: frozenset[str] = frozenset({SEASON_TYPE_REGULAR, SEASON_TYPE_PLAYOFFS})

# Raw columns consumed from a source's game-log rows.
SOURCE_GAME_LOG_COLUMNS: tuple[str, ...] = (
    "season",
    "season_type",
    "game_id",
    "game_date",
    "player_id",
    "player_name",
    "team_id",
    "team_abbreviation",
    "min",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "pts",
)

COUNTING_STATS: tuple[str, ...] = (
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "pts",
)

# One row per player-season after aggregation, before derived metrics.
SEASON_TOTAL_COLUMNS: tuple[str, ...] = (
    "season",
    "season_type",
    "player_id",
    "player_name",
    "team_id",
    "team_abbreviation",
    "gp",
    "min",
    *COUNTING_STATS,
)

DERIVED_RATE_COLUMNS: tuple[str, ...] = (
    "ts_pct",
    "efg_pct",
    "fg3a_rate",
    "ftr",
    "ast_to",
)


class PlayerSeason(BaseModel):
    """One player's totals for one season. Validated on the way out of transform."""

    model_config = {"frozen": True}

    season: int = Field(ge=1997, le=2100)
    season_type: str
    player_id: int
    player_name: str
    team_id: int
    team_abbreviation: str

    gp: int = Field(ge=0)
    min: float = Field(ge=0)

    fgm: float = Field(ge=0)
    fga: float = Field(ge=0)
    fg3m: float = Field(ge=0)
    fg3a: float = Field(ge=0)
    ftm: float = Field(ge=0)
    fta: float = Field(ge=0)
    oreb: float = Field(ge=0)
    dreb: float = Field(ge=0)
    reb: float = Field(ge=0)
    ast: float = Field(ge=0)
    stl: float = Field(ge=0)
    blk: float = Field(ge=0)
    tov: float = Field(ge=0)
    pts: float = Field(ge=0)

    is_multi_team: bool = False

    @field_validator("season_type")
    @classmethod
    def _canonical_season_type(cls, value: str) -> str:
        if value not in SEASON_TYPES:
            raise ValueError(
                f"season_type {value!r} is not canonical. Use one of "
                f"{sorted(SEASON_TYPES)}. Normalize at the adapter boundary; do "
                f"not invent a spelling here."
            )
        return value

    @field_validator("team_abbreviation")
    @classmethod
    def _label_not_key(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned:
            raise ValueError("team_abbreviation is empty; the source row is malformed.")
        return cleaned

    @field_validator("fg3a")
    @classmethod
    def _threes_are_field_goals(cls, value: float, info) -> float:
        fga = info.data.get("fga")
        if fga is not None and value > fga:
            raise ValueError(
                f"fg3a ({value}) exceeds fga ({fga}); three-point attempts are a "
                f"subset of field goal attempts, so the row is corrupt."
            )
        return value

    @field_validator("ftm")
    @classmethod
    def _makes_not_above_attempts_ft(cls, value: float, info) -> float:
        fta = info.data.get("fta")
        if fta is not None and value > fta:
            raise ValueError(f"ftm ({value}) exceeds fta ({fta}).")
        return value

    @field_validator("fgm")
    @classmethod
    def _makes_not_above_attempts_fg(cls, value: float, info) -> float:
        fga = info.data.get("fga")
        if fga is not None and value > fga:
            raise ValueError(f"fgm ({value}) exceeds fga ({fga}).")
        return value
