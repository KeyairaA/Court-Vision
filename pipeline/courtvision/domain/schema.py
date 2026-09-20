"""The canonical data contract.

The notebook's 24-column layout is the de facto contract that everything
downstream depends on, but it was never written down anywhere enforceable, and
it contains one defect: the cleaning step drops TEAM_ID and keys on
TEAM_ABBREVIATION.

That is backwards. TEAM_ID is the stable franchise anchor that survives a
relocation; the abbreviation is a per-season display label that does not. When
the Connecticut Sun become the Houston Comets in 2027, a pipeline keyed on the
abbreviation splits one franchise's history into two unrelated teams.

So TEAM_ID is restored here and is the team key. TEAM_ABBREVIATION is retained
purely as the label that was current in that season.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

# The raw column names nba_api returns that the pipeline actually consumes.
SOURCE_COLUMNS: tuple[str, ...] = (
    "PLAYER_ID",
    "PLAYER_NAME",
    "TEAM_ID",
    "TEAM_ABBREVIATION",
    "GP",
    "MIN",
    "FGM",
    "FGA",
    "FG_PCT",
    "FG3M",
    "FG3A",
    "FG3_PCT",
    "FTM",
    "FTA",
    "FT_PCT",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TOV",
    "PTS",
)

RENAMES: dict[str, str] = {
    "PLAYER_NAME": "PLAYER",
    "TEAM_ABBREVIATION": "TEAM",
}

# The canonical column order after cleaning. TEAM_ID sits next to TEAM so the
# key and its label travel together and the defect is hard to reintroduce.
CANONICAL_COLUMNS: tuple[str, ...] = (
    "Year",
    "Season_type",
    "PLAYER_ID",
    "PLAYER",
    "TEAM_ID",
    "TEAM",
    "GP",
    "MIN",
    "FGM",
    "FGA",
    "FG_PCT",
    "FG3M",
    "FG3A",
    "FG3_PCT",
    "FTM",
    "FTA",
    "FT_PCT",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TOV",
    "PTS",
)

COUNTING_STATS: tuple[str, ...] = (
    "FGM",
    "FGA",
    "FG3M",
    "FG3A",
    "FTM",
    "FTA",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TOV",
    "PTS",
)


class SeasonType(str):
    """Season type as a single canonical value.

    The notebook carried two spellings of the same concept, 'Regular Season' at
    ingestion and 'RS' in downstream filters, which silently produced empty
    frames and blank charts twice. One spelling, defined once.
    """

    REGULAR = "Regular Season"
    PLAYOFFS = "Playoffs"


class PlayerSeason(BaseModel):
    """One player's line for one season. Validated on the way out of cleaning."""

    model_config = {"frozen": True}

    Year: int = Field(ge=1997, le=2100)
    Season_type: str
    PLAYER_ID: int
    PLAYER: str
    TEAM_ID: int
    TEAM: str

    GP: int = Field(ge=0)
    MIN: float = Field(ge=0)

    FGM: float = Field(ge=0)
    FGA: float = Field(ge=0)
    FG_PCT: float | None = Field(default=None, ge=0, le=1)
    FG3M: float = Field(ge=0)
    FG3A: float = Field(ge=0)
    FG3_PCT: float | None = Field(default=None, ge=0, le=1)
    FTM: float = Field(ge=0)
    FTA: float = Field(ge=0)
    FT_PCT: float | None = Field(default=None, ge=0, le=1)

    OREB: float = Field(ge=0)
    DREB: float = Field(ge=0)
    REB: float = Field(ge=0)
    AST: float = Field(ge=0)
    STL: float = Field(ge=0)
    BLK: float = Field(ge=0)
    TOV: float = Field(ge=0)
    PTS: float = Field(ge=0)

    @field_validator("Season_type")
    @classmethod
    def _known_season_type(cls, value: str) -> str:
        allowed = {SeasonType.REGULAR, SeasonType.PLAYOFFS}
        if value not in allowed:
            raise ValueError(
                f"Season_type {value!r} is not one of {sorted(allowed)}. "
                "Use the canonical spelling; do not invent abbreviations."
            )
        return value

    @field_validator("TEAM")
    @classmethod
    def _team_is_a_label_not_a_key(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("TEAM abbreviation is empty; the source row is malformed.")
        return value.strip().upper()
