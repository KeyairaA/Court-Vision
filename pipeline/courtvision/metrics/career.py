"""Career-level aggregation across seasons.

WHY THIS MODULE EXISTS
----------------------
The Streamlit comparison page computes a career average like this:

    df[stat_cols].mean()

That takes the unweighted mean of per-game averages across seasons, which
treats a two-game injury season exactly like a forty-game season. A player who
averaged 4 points in 2 games and 20 points in 40 games comes out at 12.0, when
the honest answer is 19.2.

This is a real error sitting in the headline table of a comparison page, not a
stylistic preference, and it is visible to anyone who checks a number.

The fix is to aggregate from totals rather than averaging averages. Sum the
counting stats across seasons, sum the games, then divide once at the end.
"""

from __future__ import annotations

import pandas as pd

from courtvision.metrics.rates import (
    add_per_game_metrics,
    add_per_minute_metrics,
    add_rate_metrics,
)

CAREER_SUM_COLUMNS: tuple[str, ...] = (
    "gp",
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


def career_totals(season_stats: pd.DataFrame) -> pd.DataFrame:
    """Sum a player's season totals into career totals.

    Input is one row per player-season (the output of
    `transform.aggregate.aggregate_to_season`). Output is one row per player.

    Derived rates are recomputed from the career totals rather than averaged
    across seasons, which is the whole point: a rate is a ratio of sums, never a
    sum of ratios.
    """
    if season_stats.empty:
        return season_stats.copy()

    grouped = season_stats.groupby(["player_id", "player_name"], as_index=False)[
        list(CAREER_SUM_COLUMNS)
    ].sum()

    spans = season_stats.groupby("player_id", as_index=False).agg(
        first_season=("season", "min"),
        last_season=("season", "max"),
        seasons_played=("season", "nunique"),
    )

    out = grouped.merge(spans, on="player_id", how="left")
    out = add_rate_metrics(out)
    out = add_per_game_metrics(out)
    out = add_per_minute_metrics(out)
    return out


def career_average(season_stats: pd.DataFrame, stat: str, weight: str = "gp") -> pd.Series:
    """Games-weighted career average of a per-game stat, indexed by player_id.

    Provided for cases where only a per-game column is available rather than a
    total. Prefer `career_totals`, which needs no weighting because it never
    divides until the end.
    """
    if stat not in season_stats.columns:
        raise KeyError(f"{stat!r} is not a column; available: {list(season_stats.columns)}")

    def _weighted(group: pd.DataFrame) -> float:
        weights = group[weight]
        total_weight = weights.sum()
        if total_weight == 0:
            return float("nan")
        return float((group[stat] * weights).sum() / total_weight)

    return season_stats.groupby("player_id").apply(_weighted, include_groups=False)


def season_trajectory(
    season_stats: pd.DataFrame,
    player_id: int,
    stat: str,
) -> pd.DataFrame:
    """One player's season-by-season values for a stat, oldest first.

    Returns season and value only. Callers plotting this must still check
    `Franchise.crosses_lineage_break` before connecting points, and should not
    assume consecutive seasons: a player can miss a year entirely, and drawing a
    straight line across the gap implies data that does not exist.
    """
    player = season_stats[season_stats["player_id"] == player_id]
    if player.empty:
        return pd.DataFrame(columns=["season", stat])
    return player[["season", stat]].sort_values("season").reset_index(drop=True)
