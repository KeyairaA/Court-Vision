"""Data quality gates: completeness and reconciliation.

These exist because of two things found by running against real data.

COMPLETENESS
------------
The mirror's 2026 game-log file carries team totals for all 300 games of the
season but player rows only through July 22. The final five weeks existed at
the team level and not at all at the player level, so every 2026 player total
came out roughly a third short. Nothing errored. A'ja Wilson simply appeared
to have played 24 games of a 40-game season.

The file contains its own answer key: team rows are complete. Comparing the set
of games with team rows against the set with player rows exposes any gap
exactly. A game whose team rows show zero minutes is a forfeit (August 3, 2018,
Washington vs Las Vegas) and is excluded rather than counted as missing.

RECONCILIATION
--------------
Across 4,238 team-games over ten seasons, player rows summed per team-game match
the team row exactly for points, every shooting stat, rebounds, assists, steals
and blocks. The single exception is turnovers, where the team total runs 1 to 6
higher. Those are team turnovers, such as shot-clock violations, charged to the
team rather than to any player. That is correct bookkeeping, not an error.

So the rule is strict: exact equality for every stat except turnovers, and team
turnovers never below the players' sum. Any other disagreement is corruption,
and it also validates gap-filled rows against a source they did not come from.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from courtvision.transform.aggregate import normalize_season_type

EXACT_STATS: tuple[str, ...] = (
    "pts",
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
)
TEAM_MAY_EXCEED: tuple[str, ...] = ("tov",)


class ReconciliationFailed(ValueError):
    """Player rows do not add up to the team rows for at least one game."""


@dataclass
class Coverage:
    season: int
    games_played: int
    games_covered: int
    missing_game_ids: list[str]
    forfeit_game_ids: list[str]
    last_covered_date: str | None
    last_played_date: str | None

    @property
    def ratio(self) -> float:
        return self.games_covered / self.games_played if self.games_played else 1.0

    @property
    def complete(self) -> bool:
        return not self.missing_game_ids

    def as_dict(self) -> dict:
        return {
            "games_played": self.games_played,
            "games_covered": self.games_covered,
            "coverage": round(self.ratio, 4),
            "complete": self.complete,
            "missing_games": len(self.missing_game_ids),
            "forfeits": len(self.forfeit_game_ids),
            "last_covered_date": self.last_covered_date,
            "last_played_date": self.last_played_date,
        }


@dataclass
class Reconciliation:
    team_games_compared: int
    mismatches: list[dict] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not self.mismatches


def _regular(raw: pd.DataFrame, season_type: str) -> pd.DataFrame:
    kinds = raw["season_type"].map(normalize_season_type)
    return raw[kinds == season_type]


def season_coverage(raw_logs: pd.DataFrame, season: int, season_type: str) -> Coverage:
    """Compare games with team rows against games with player rows."""
    logs = _regular(raw_logs, season_type)
    team = logs[logs["player_id"].isna()]
    players = logs[logs["player_id"].notna()]

    minutes_by_game = team.groupby("game_id")["min"].sum()
    forfeits = sorted(minutes_by_game[minutes_by_game <= 0].index)
    played = set(minutes_by_game[minutes_by_game > 0].index)
    covered = played & set(players["game_id"])
    missing = sorted(played - covered)

    def last_date(frame: pd.DataFrame) -> str | None:
        if frame.empty:
            return None
        return str(pd.to_datetime(frame["game_date"]).max().date())

    return Coverage(
        season=season,
        games_played=len(played),
        games_covered=len(covered),
        missing_game_ids=missing,
        forfeit_game_ids=forfeits,
        last_covered_date=last_date(players[players["game_id"].isin(covered)]),
        last_played_date=last_date(team[team["game_id"].isin(played)]),
    )


def reconcile(raw_logs: pd.DataFrame, season_type: str) -> Reconciliation:
    """Check that player rows add up to team rows, game by game."""
    logs = _regular(raw_logs, season_type)
    stats = list(EXACT_STATS + TEAM_MAY_EXCEED)
    keys = ["game_id", "team_id"]

    team = logs[logs["player_id"].isna()].groupby(keys)[stats].sum()
    players = logs[logs["player_id"].notna()].groupby(keys)[stats].sum()
    both = team.join(players, lsuffix="_team", rsuffix="_players", how="inner")

    mismatches: list[dict] = []
    for stat in EXACT_STATS:
        delta = both[f"{stat}_team"] - both[f"{stat}_players"]
        for (game_id, team_id), _value in delta[delta.abs() > 1e-6].items():
            mismatches.append(
                {
                    "game_id": game_id,
                    "team_id": int(team_id),
                    "stat": stat,
                    "team": float(both.loc[(game_id, team_id), f"{stat}_team"]),
                    "players": float(both.loc[(game_id, team_id), f"{stat}_players"]),
                }
            )
    for stat in TEAM_MAY_EXCEED:
        delta = both[f"{stat}_team"] - both[f"{stat}_players"]
        for (game_id, team_id), _value in delta[delta < -1e-6].items():
            mismatches.append(
                {
                    "game_id": game_id,
                    "team_id": int(team_id),
                    "stat": stat,
                    "team": float(both.loc[(game_id, team_id), f"{stat}_team"]),
                    "players": float(both.loc[(game_id, team_id), f"{stat}_players"]),
                }
            )

    return Reconciliation(team_games_compared=int(len(both)), mismatches=mismatches)
