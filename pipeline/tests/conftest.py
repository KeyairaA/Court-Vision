"""Shared fixture builders.

`make_season` produces game logs shaped like the real mirror files: player rows
plus two team rows per game, where the team rows genuinely reconcile with the
players (and carry a few extra team turnovers, as real data does). Tests of the
quality gates are only meaningful against fixtures with that structure.
"""

from __future__ import annotations

import pandas as pd
import pytest

EXACT = (
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
    "pts",
)
ALL_STATS = EXACT + ("tov",)


def _player_line(k: int) -> dict:
    fgm, fg3m, ftm = 3 + k, 1, 2
    return {
        "min": 30.0,
        "fgm": fgm,
        "fga": 8 + k,
        "fg3m": fg3m,
        "fg3a": 3,
        "ftm": ftm,
        "fta": 3,
        "oreb": 1,
        "dreb": 3,
        "reb": 4,
        "ast": 1 + k,
        "stl": 1,
        "blk": 0,
        "tov": 1,
        "pts": 2 * (fgm - fg3m) + 3 * fg3m + ftm,
    }


def make_season(
    season: int = 2026,
    teams: tuple[tuple[int, str], ...] = ((1611661313, "NYL"), (1611661328, "SEA")),
    games: int = 4,
    players_per_team: int = 3,
    start: str | None = None,
    season_type: str = "regular-season",
    team_turnovers: int = 2,
    drop_player_rows_after: int | None = None,
) -> pd.DataFrame:
    """Build a season of game logs with reconciling team rows.

    drop_player_rows_after: keep player rows only for the first N games,
    reproducing the 2026 gap where team rows continue but player rows stop.
    """
    base = pd.Timestamp(start or f"{season}-05-08")
    rows = []
    for g in range(games):
        game_id = f"10{str(season)[-2:]}{g:05d}"
        date = (base + pd.Timedelta(days=3 * g)).strftime("%Y-%m-%d")
        for team_id, abbr in teams:
            totals = {s: 0.0 for s in ALL_STATS}
            for k in range(players_per_team):
                line = _player_line(k)
                for s in ALL_STATS:
                    totals[s] += line[s]
                if drop_player_rows_after is None or g < drop_player_rows_after:
                    rows.append(
                        {
                            "season": season,
                            "season_type": season_type,
                            "game_id": game_id,
                            "game_date": date,
                            "player_id": team_id % 100000 * 10 + k,
                            "player_name": f"{abbr} Player {k}",
                            "team_id": team_id,
                            "team_abbreviation": abbr,
                            "measure_type": "p",
                            **line,
                        }
                    )
            rows.append(
                {
                    "season": season,
                    "season_type": season_type,
                    "game_id": game_id,
                    "game_date": date,
                    "player_id": None,
                    "player_name": None,
                    "team_id": team_id,
                    "team_abbreviation": abbr,
                    "measure_type": None,
                    "min": 200.0,
                    **{s: totals[s] for s in EXACT},
                    "tov": totals["tov"] + team_turnovers,
                }
            )
    return pd.DataFrame(rows)


def boxscores_from(season_logs: pd.DataFrame, dnp_per_team_game: int = 2) -> pd.DataFrame:
    """Box scores covering every game, including DNP roster rows."""
    players = season_logs[season_logs["player_id"].notna()]
    rows = []
    for r in players.itertuples(index=False):
        first, family = str(r.player_name).rsplit(" ", 1)
        rows.append(
            {
                "game_id": r.game_id,
                "team_id": r.team_id,
                "team_tricode": r.team_abbreviation,
                "person_id": int(r.player_id),
                "first_name": first,
                "family_name": family,
                "minutes": "30:00",
                "comment": "",
                "field_goals_made": r.fgm,
                "field_goals_attempted": r.fga,
                "three_pointers_made": r.fg3m,
                "three_pointers_attempted": r.fg3a,
                "free_throws_made": r.ftm,
                "free_throws_attempted": r.fta,
                "rebounds_offensive": r.oreb,
                "rebounds_defensive": r.dreb,
                "rebounds_total": r.reb,
                "assists": r.ast,
                "steals": r.stl,
                "blocks": r.blk,
                "turnovers": r.tov,
                "points": r.pts,
                "season": r.season,
            }
        )
    for (game_id, team_id), _ in players.groupby(["game_id", "team_id"]):
        for d in range(dnp_per_team_game):
            rows.append(
                {
                    "game_id": game_id,
                    "team_id": team_id,
                    "team_tricode": "",
                    "person_id": 900000 + d,
                    "first_name": "Bench",
                    "family_name": f"Player{d}",
                    "minutes": "",
                    "comment": "DNP - Coach's Decision",
                    **{
                        c: 0
                        for c in (
                            "field_goals_made",
                            "field_goals_attempted",
                            "three_pointers_made",
                            "three_pointers_attempted",
                            "free_throws_made",
                            "free_throws_attempted",
                            "rebounds_offensive",
                            "rebounds_defensive",
                            "rebounds_total",
                            "assists",
                            "steals",
                            "blocks",
                            "turnovers",
                            "points",
                        )
                    },
                    "season": players["season"].iloc[0],
                }
            )
    return pd.DataFrame(rows)


@pytest.fixture
def season_logs() -> pd.DataFrame:
    return make_season()
