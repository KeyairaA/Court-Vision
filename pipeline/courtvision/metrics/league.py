"""League-wide season trends.

A LEAGUE AVERAGE IS A RATIO OF LEAGUE SUMS
------------------------------------------
The notebook computed its "game evolution" lines as the mean of every player's
per-game average. That weights a two-minute bench player exactly like a starter,
so league "points per game" came out near 9, a number that describes no real
team or player.

Here the unit is the team-game: what a typical team produces in a typical night.
League rates such as TS% are computed from league totals the same way.

TEAM ROWS, NOT SUMMED PLAYER ROWS
---------------------------------
The source files carry one team row per team per game, and those rows are the
authoritative team-game totals. League trends are computed from them rather
than from player rows summed up, for two reasons found in real data:

  - Team rows include team turnovers (shot-clock violations and the like),
    which are charged to no player. Summed player rows understate turnovers by
    1 to 6 per team-game.
  - Team rows are complete even where player rows are not. The 2026 file had
    team rows for all 300 games but player rows only through July 22. League
    trends stay correct regardless of player-level gaps.

Forfeits (team rows with zero minutes) are excluded from the game count.

CONFOUNDS TRAVEL WITH THE NUMBERS
---------------------------------
Every season row carries its structural caveats from config, so no chart can
show a 2025 or 2026 movement without the expansion note next to it in the data.
"""

from __future__ import annotations

import pandas as pd

from courtvision import config
from courtvision.metrics.rates import (
    effective_fg_pct,
    free_throw_rate,
    shooting_pct,
    three_point_attempt_rate,
    true_shooting_pct,
)

_SUM = (
    "pts",
    "reb",
    "oreb",
    "dreb",
    "ast",
    "stl",
    "blk",
    "tov",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
)


def season_trend_row(team_rows: pd.DataFrame, player_rows: pd.DataFrame) -> dict:
    """Summarize one regular season.

    Args:
        team_rows: the season's team-level rows (null player_id), one season type.
        player_rows: the season's player-level rows, used only to count players.
    """
    if team_rows.empty:
        raise ValueError("Cannot summarize a season with no team rows.")

    seasons = set(pd.to_numeric(team_rows["season"]).astype(int))
    if len(seasons) != 1:
        raise ValueError(f"Expected one season, got {sorted(seasons)}.")
    season = seasons.pop()

    played = team_rows[pd.to_numeric(team_rows["min"], errors="coerce") > 0]
    team_games = int(len(played.drop_duplicates(["game_id", "team_id"])))
    games = int(played["game_id"].nunique())
    teams = int(played["team_id"].nunique())
    totals = played[list(_SUM)].apply(pd.to_numeric, errors="coerce").sum()

    def per_team_game(stat: str) -> float:
        return float(totals[stat] / team_games) if team_games else float("nan")

    def one(stat: str) -> pd.Series:
        return pd.Series([float(totals[stat])])

    return {
        "season": season,
        "teams": teams,
        "players": int(player_rows["player_id"].nunique()),
        "games": games,
        "games_per_team": round(team_games / teams, 1) if teams else None,
        "pts_per_team_game": per_team_game("pts"),
        "reb_per_team_game": per_team_game("reb"),
        "ast_per_team_game": per_team_game("ast"),
        "tov_per_team_game": per_team_game("tov"),
        "fg3a_per_team_game": per_team_game("fg3a"),
        "fta_per_team_game": per_team_game("fta"),
        "fg_pct": float(shooting_pct(one("fgm"), one("fga")).iloc[0]),
        "fg3_pct": float(shooting_pct(one("fg3m"), one("fg3a")).iloc[0]),
        "ft_pct": float(shooting_pct(one("ftm"), one("fta")).iloc[0]),
        "ts_pct": float(true_shooting_pct(one("pts"), one("fga"), one("fta")).iloc[0]),
        "efg_pct": float(effective_fg_pct(one("fgm"), one("fg3m"), one("fga")).iloc[0]),
        "fg3a_rate": float(three_point_attempt_rate(one("fg3a"), one("fga")).iloc[0]),
        "ftr": float(free_throw_rate(one("fta"), one("fga")).iloc[0]),
        "confound": config.CONFOUNDED_SEASONS.get(season),
        "label_change": config.LABEL_CHANGES_IN_WINDOW.get(season),
    }


def league_trends(rows_by_season: dict[int, tuple[pd.DataFrame, pd.DataFrame]]) -> pd.DataFrame:
    """rows_by_season maps season -> (team_rows, player_rows)."""
    return pd.DataFrame(
        [season_trend_row(team, players) for _, (team, players) in sorted(rows_by_season.items())]
    )
