"""Game logs to season totals.

The sportsdataverse mirror publishes one row per player per game. Court Vision
needs one row per player per season. This module is that step, and it is where
two non-obvious decisions get made explicitly rather than by accident.

TRADED PLAYERS
--------------
A player traded mid-season appears under two team_ids. Grouping by player AND
team produces more rows than players: 2017 gives 168 rows for 157 players.

Court Vision groups by player alone and sums across teams, so a season is a
season regardless of how many jerseys it involved. Team affiliation is then
resolved to the team the player appeared for most, with the full set retained
so the UI can say "traded mid-season" rather than silently picking one.

This is a deliberate divergence from `leaguedashplayerstats`, which handles
multi-team seasons its own way. The two sources will not agree row-for-row, and
that is expected rather than a bug.

RATES COME FROM TOTALS
----------------------
Every derived metric is computed after summing, never averaged across games. A
rate is a ratio of sums, not a sum of ratios. Averaging per-game TS% across 34
games gives a different and wrong answer.
"""

from __future__ import annotations

import logging

import pandas as pd

from courtvision.domain.schema import SEASON_TYPE_PLAYOFFS, SEASON_TYPE_REGULAR
from courtvision.metrics.rates import (
    add_per_game_metrics,
    add_per_minute_metrics,
    add_rate_metrics,
)

logger = logging.getLogger(__name__)

COUNTING_COLUMNS: tuple[str, ...] = (
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

# The mirror ships season_type lowercase and hyphenated. The stats API ships it
# title-cased with a space. The notebook used a two-letter abbreviation. Three
# spellings of one concept, and the mismatch silently produced empty frames and
# blank charts twice before. Normalization happens here, once.
SEASON_TYPE_ALIASES: dict[str, str] = {
    "regular-season": SEASON_TYPE_REGULAR,
    "regular season": SEASON_TYPE_REGULAR,
    "rs": SEASON_TYPE_REGULAR,
    SEASON_TYPE_REGULAR.lower(): SEASON_TYPE_REGULAR,
    "playoffs": SEASON_TYPE_PLAYOFFS,
    "playoff": SEASON_TYPE_PLAYOFFS,
    "po": SEASON_TYPE_PLAYOFFS,
}


class UnknownSeasonType(ValueError):
    """A season_type value that no alias covers.

    Raised rather than silently dropped. A new spelling appearing upstream is
    exactly the condition that produced blank charts before, and it must be a
    loud failure rather than an empty frame.
    """


def normalize_season_type(value: str) -> str:
    key = str(value).strip().lower()
    if key not in SEASON_TYPE_ALIASES:
        raise UnknownSeasonType(
            f"season_type {value!r} is not recognized. Known spellings: "
            f"{sorted(SEASON_TYPE_ALIASES)}. Add an alias rather than filtering "
            f"it out, or the rows disappear without a trace."
        )
    return SEASON_TYPE_ALIASES[key]


class SuspiciousRowMix(ValueError):
    """The player/team row split does not look like the expected shape."""


def drop_team_rows(game_logs: pd.DataFrame) -> pd.DataFrame:
    """Remove team-level rows, which the source mixes in with player rows.

    THIS IS NOT OPTIONAL. The mirror's game-log files are a union of player
    rows and team rows. A team row has a null `player_id`, a null
    `player_name`, a null `measure_type`, and `min` of exactly 200, which is
    five players times forty minutes of team floor time.

    2026 carries 600 of them, exactly two per game across 300 games. 2017
    carries 408 in the regular season, two per game across 204 games.

    Aggregating without this filter silently folds entire team stat lines into
    season totals. Nothing errors, the charts render, and every number is
    wrong. This was caught only by running against real data; synthetic
    fixtures had no such rows.
    """
    is_player = game_logs["player_id"].notna()
    dropped = int((~is_player).sum())

    # Checked before the ratio guard below, because "nothing but team rows" is
    # a more specific diagnosis than "the ratio looks wrong".
    if not is_player.any():
        raise SuspiciousRowMix("Every row has a null player_id. This file contains no player rows.")

    if dropped:
        team_rows = game_logs[~is_player]
        games = team_rows["game_id"].nunique()
        expected = games * 2
        logger.info(
            "Dropped %d team-level rows across %d games (expected ~%d).",
            dropped,
            games,
            expected,
        )
        # Two per game is the shape. Tolerate a little slack for partial data,
        # but a wild deviation means the file is not what we think it is.
        if games and not (expected * 0.8 <= dropped <= expected * 1.2):
            raise SuspiciousRowMix(
                f"Dropped {dropped} non-player rows across {games} games; "
                f"expected roughly {expected} (two per game). The source file "
                f"layout may have changed, so verify before trusting output."
            )

    return game_logs[is_player].copy()


def normalize_game_logs(game_logs: pd.DataFrame) -> pd.DataFrame:
    """Clean raw source rows into the canonical shape.

    Drops team rows, normalizes season_type, parses dates, coerces types.
    """
    out = drop_team_rows(game_logs)
    out["season_type"] = out["season_type"].map(normalize_season_type)
    if "game_date" in out.columns:
        out["game_date"] = pd.to_datetime(out["game_date"], errors="coerce")

    for column in COUNTING_COLUMNS:
        if column in out.columns:
            out[column] = pd.to_numeric(out[column], errors="coerce").fillna(0.0)

    out["player_id"] = out["player_id"].astype("int64")
    out["team_id"] = out["team_id"].astype("int64")
    out["season"] = out["season"].astype("int64")
    return out


def _resolve_team(group: pd.DataFrame) -> pd.Series:
    """Pick the team a player is primarily associated with for a season.

    Most games played wins. Ties break toward the later game_date, which for a
    mid-season trade means the team they finished with.
    """
    counts = group.groupby(["team_id", "team_abbreviation"]).size()
    max_games = counts.max()
    contenders = counts[counts == max_games]

    if len(contenders) == 1:
        team_id, team_abbr = contenders.index[0]
    else:
        contender_ids = {tid for tid, _ in contenders.index}
        latest = group[group["team_id"].isin(contender_ids)].sort_values("game_date")
        team_id = int(latest.iloc[-1]["team_id"])
        team_abbr = str(latest.iloc[-1]["team_abbreviation"])

    all_teams = group.sort_values("game_date")["team_abbreviation"].drop_duplicates().tolist()
    return pd.Series(
        {
            "team_id": int(team_id),
            "team_abbreviation": str(team_abbr),
            "teams": all_teams,
            "is_multi_team": len(all_teams) > 1,
        }
    )


def aggregate_to_season(
    game_logs: pd.DataFrame,
    season_type: str = SEASON_TYPE_REGULAR,
) -> pd.DataFrame:
    """Collapse game logs into one row per player-season, with metrics attached.

    Args:
        game_logs: raw or normalized mirror rows.
        season_type: canonical season type to keep.

    Returns:
        One row per player per season, with totals, per-game, per-36 and rate
        columns. Empty input returns an empty frame rather than raising.
    """
    if game_logs.empty:
        logger.warning("aggregate_to_season received an empty frame.")
        return game_logs.copy()
    return aggregate_normalized(normalize_game_logs(game_logs), season_type=season_type)


def aggregate_normalized(
    normalized_logs: pd.DataFrame,
    season_type: str = SEASON_TYPE_REGULAR,
) -> pd.DataFrame:
    """Aggregate logs that have already been through normalize_game_logs.

    Split out so a caller that needs the normalized rows for something else
    (league trends, quality checks) normalizes once rather than twice.
    """
    available = sorted(set(normalized_logs["season_type"]))
    logs = normalized_logs[normalized_logs["season_type"] == season_type]

    if logs.empty:
        raise ValueError(
            f"No rows remain after filtering to season_type={season_type!r}. "
            f"Available values were: {available}"
        )

    totals = logs.groupby(["player_id", "season"], as_index=False).agg(
        player_name=("player_name", "last"),
        gp=("game_id", "nunique"),
        **{column: (column, "sum") for column in COUNTING_COLUMNS},
    )

    teams = (
        logs.groupby(["player_id", "season"])
        .apply(_resolve_team, include_groups=False)
        .reset_index()
    )

    out = totals.merge(teams, on=["player_id", "season"], how="left")
    out["season_type"] = season_type

    out = add_rate_metrics(out)
    out = add_per_game_metrics(out)
    out = add_per_minute_metrics(out)

    multi = int(out["is_multi_team"].sum())
    if multi:
        logger.info("%d player-seasons involved more than one team.", multi)

    return out.sort_values(["season", "pts"], ascending=[True, False]).reset_index(drop=True)


def aggregate_window(
    game_logs_by_season: dict[int, pd.DataFrame],
    season_type: str = SEASON_TYPE_REGULAR,
) -> pd.DataFrame:
    """Aggregate several seasons of game logs into one frame."""
    frames = [
        aggregate_to_season(logs, season_type=season_type)
        for logs in game_logs_by_season.values()
        if not logs.empty
    ]
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)
