"""Tests for game-log aggregation and career rollup.

The two behaviours worth protecting here are the traded-player case and the
rule that a rate is a ratio of sums rather than a sum of ratios. Both are
places where a plausible-looking implementation produces numbers that are
quietly wrong.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from courtvision.domain.schema import SEASON_TYPE_PLAYOFFS, SEASON_TYPE_REGULAR
from courtvision.metrics.career import career_average, career_totals, season_trajectory
from courtvision.transform.aggregate import (
    SuspiciousRowMix,
    UnknownSeasonType,
    aggregate_to_season,
    drop_team_rows,
    normalize_season_type,
)

COUNTING = [
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
]


def game(
    player_id: int,
    game_id: str,
    team_id: int,
    team_abbr: str,
    season: int = 2026,
    season_type: str = "regular-season",
    date: str = "2026-05-08",
    **stats: float,
) -> dict:
    row = {
        "player_id": player_id,
        "player_name": f"Player {player_id}",
        "game_id": game_id,
        "game_date": date,
        "team_id": team_id,
        "team_abbreviation": team_abbr,
        "season": season,
        "season_type": season_type,
    }
    for column in COUNTING:
        row[column] = float(stats.get(column, 0.0))
    return row


class TestSeasonTypeNormalization:
    @pytest.mark.parametrize(
        "raw", ["regular-season", "Regular Season", "REGULAR SEASON", "rs", "RS"]
    )
    def test_regular_season_spellings(self, raw):
        assert normalize_season_type(raw) == SEASON_TYPE_REGULAR

    @pytest.mark.parametrize("raw", ["playoffs", "Playoffs", "PO"])
    def test_playoff_spellings(self, raw):
        assert normalize_season_type(raw) == SEASON_TYPE_PLAYOFFS

    def test_an_unknown_spelling_raises_rather_than_vanishing(self):
        """The failure that blanked the charts twice was rows silently not
        matching a filter. A new upstream spelling must be loud."""
        with pytest.raises(UnknownSeasonType, match="not recognized"):
            normalize_season_type("postseason")


class TestBasicAggregation:
    @pytest.fixture
    def logs(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                game(
                    1,
                    "g1",
                    100,
                    "NYL",
                    min=30,
                    fga=10,
                    fgm=5,
                    fta=4,
                    ftm=4,
                    pts=14,
                    ast=6,
                    tov=2,
                    fg3a=4,
                    fg3m=2,
                    reb=5,
                ),
                game(
                    1,
                    "g2",
                    100,
                    "NYL",
                    min=30,
                    fga=10,
                    fgm=5,
                    fta=6,
                    ftm=6,
                    pts=16,
                    ast=6,
                    tov=2,
                    fg3a=6,
                    fg3m=3,
                    reb=5,
                ),
            ]
        )

    def test_one_row_per_player_season(self, logs):
        out = aggregate_to_season(logs)
        assert len(out) == 1

    def test_totals_are_summed(self, logs):
        out = aggregate_to_season(logs).iloc[0]
        assert out["gp"] == 2
        assert out["min"] == 60
        assert out["pts"] == 30
        assert out["fga"] == 20
        assert out["fta"] == 10

    def test_season_type_is_canonical(self, logs):
        assert aggregate_to_season(logs).iloc[0]["season_type"] == SEASON_TYPE_REGULAR

    def test_rates_come_from_totals(self, logs):
        """TS from totals: 30 / (2 * (20 + 0.44 * 10)) = 30 / 48.8 = 0.614754...

        Averaging the two games' TS values instead gives a different number.
        This test is the guard against that mistake.
        """
        out = aggregate_to_season(logs).iloc[0]
        assert out["ts_pct"] == pytest.approx(30 / (2 * (20 + 0.44 * 10)), abs=1e-9)

        game1_ts = 14 / (2 * (10 + 0.44 * 4))
        game2_ts = 16 / (2 * (10 + 0.44 * 6))
        averaged = (game1_ts + game2_ts) / 2
        assert out["ts_pct"] != pytest.approx(averaged, abs=1e-6)

    def test_per_game_and_per36_present(self, logs):
        out = aggregate_to_season(logs).iloc[0]
        assert out["pts_pg"] == pytest.approx(15.0)
        assert out["pts_per36"] == pytest.approx(30 / 60 * 36)

    def test_playoffs_can_be_selected(self, logs):
        playoff = logs.copy()
        playoff["season_type"] = "playoffs"
        out = aggregate_to_season(playoff, season_type=SEASON_TYPE_PLAYOFFS)
        assert out.iloc[0]["season_type"] == SEASON_TYPE_PLAYOFFS

    def test_filtering_everything_out_raises(self, logs):
        with pytest.raises(ValueError, match="No rows remain"):
            aggregate_to_season(logs, season_type=SEASON_TYPE_PLAYOFFS)


class TestTradedPlayers:
    """2017 produced 168 rows for 157 players when grouped by player and team.

    A season is a season regardless of how many jerseys it involved.
    """

    @pytest.fixture
    def logs(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                game(1, "g1", 100, "NYL", date="2026-05-08", min=30, pts=10, fga=8),
                game(1, "g2", 100, "NYL", date="2026-05-15", min=30, pts=10, fga=8),
                game(1, "g3", 200, "SEA", date="2026-07-01", min=30, pts=20, fga=8),
            ]
        )

    def test_one_row_not_two(self, logs):
        assert len(aggregate_to_season(logs)) == 1

    def test_totals_span_both_teams(self, logs):
        row = aggregate_to_season(logs).iloc[0]
        assert row["gp"] == 3
        assert row["pts"] == 40

    def test_primary_team_is_most_games_played(self, logs):
        row = aggregate_to_season(logs).iloc[0]
        assert row["team_abbreviation"] == "NYL"
        assert row["team_id"] == 100

    def test_all_teams_retained(self, logs):
        row = aggregate_to_season(logs).iloc[0]
        assert row["teams"] == ["NYL", "SEA"]
        assert row["is_multi_team"] is True or row["is_multi_team"] == True  # noqa: E712

    def test_even_split_breaks_toward_the_later_team(self, logs):
        """With equal games, the team they finished the season with wins."""
        even = logs.iloc[[0, 2]].copy()
        row = aggregate_to_season(even).iloc[0]
        assert row["team_abbreviation"] == "SEA"

    def test_single_team_player_is_not_flagged(self, logs):
        single = logs.iloc[[0, 1]].copy()
        row = aggregate_to_season(single).iloc[0]
        assert not row["is_multi_team"]
        assert row["teams"] == ["NYL"]


class TestCareerRollup:
    @pytest.fixture
    def seasons(self) -> pd.DataFrame:
        """A two-game injury season and a forty-game healthy one.

        Unweighted: (4 + 20) / 2 = 12.0
        Correct:    (8 + 800) / 42 = 19.238...
        """
        logs_injury = pd.DataFrame(
            [game(1, f"i{i}", 100, "NYL", season=2025, min=10, pts=4, fga=4) for i in range(2)]
        )
        logs_healthy = pd.DataFrame(
            [game(1, f"h{i}", 100, "NYL", season=2026, min=30, pts=20, fga=15) for i in range(40)]
        )
        return pd.concat(
            [aggregate_to_season(logs_injury), aggregate_to_season(logs_healthy)],
            ignore_index=True,
        )

    def test_career_totals_are_games_weighted(self, seasons):
        career = career_totals(seasons).iloc[0]
        assert career["gp"] == 42
        assert career["pts"] == 808
        assert career["pts_pg"] == pytest.approx(808 / 42, abs=1e-9)

    def test_the_unweighted_mean_is_the_bug_being_fixed(self, seasons):
        """Averaging per-game averages treats 2 games like 40."""
        naive = seasons["pts_pg"].mean()
        correct = career_totals(seasons).iloc[0]["pts_pg"]
        assert naive == pytest.approx(12.0)
        assert correct == pytest.approx(19.238, abs=1e-3)
        assert abs(naive - correct) > 7

    def test_season_span_recorded(self, seasons):
        career = career_totals(seasons).iloc[0]
        assert career["first_season"] == 2025
        assert career["last_season"] == 2026
        assert career["seasons_played"] == 2

    def test_career_rates_recomputed_not_averaged(self, seasons):
        career = career_totals(seasons).iloc[0]
        expected = career["pts"] / (2 * (career["fga"] + 0.44 * career["fta"]))
        assert career["ts_pct"] == pytest.approx(expected, abs=1e-9)

    def test_weighted_helper_matches(self, seasons):
        weighted = career_average(seasons, "pts_pg").loc[1]
        assert weighted == pytest.approx(808 / 42, abs=1e-6)

    def test_weighted_helper_rejects_unknown_column(self, seasons):
        with pytest.raises(KeyError, match="not a column"):
            career_average(seasons, "nonexistent")

    def test_trajectory_is_ordered_oldest_first(self, seasons):
        traj = season_trajectory(seasons, player_id=1, stat="pts_pg")
        assert traj["season"].tolist() == [2025, 2026]

    def test_trajectory_of_unknown_player_is_empty(self, seasons):
        assert season_trajectory(seasons, player_id=999, stat="pts_pg").empty


class TestTeamRowsAreRemoved:
    """The source mixes team-level rows into the player game-log files.

    A team row has a null player_id and `min` of exactly 200, being five
    players times forty minutes. 2026 ships 600 of them, two per game across
    300 games. Aggregating without filtering folds whole team stat lines into
    player season totals, and nothing errors while doing it.

    This was found by running against real data, not by unit tests. These tests
    exist so it cannot come back.
    """

    def team_row(self, game_id: str, team_id: int, abbr: str, **stats) -> dict:
        row = game(0, game_id, team_id, abbr, **stats)
        row["player_id"] = None
        row["player_name"] = None
        return row

    @pytest.fixture
    def mixed(self) -> pd.DataFrame:
        rows = []
        for i in range(4):
            gid = f"g{i}"
            rows.append(game(1, gid, 100, "NYL", min=30, pts=20, fga=15, fta=4))
            rows.append(self.team_row(gid, 100, "NYL", min=200, pts=85, fga=70, fta=18))
            rows.append(self.team_row(gid, 200, "SEA", min=200, pts=80, fga=68, fta=15))
        return pd.DataFrame(rows)

    def test_team_rows_do_not_reach_the_output(self, mixed):
        out = aggregate_to_season(mixed)
        assert len(out) == 1
        assert out.iloc[0]["player_id"] == 1

    def test_totals_exclude_team_rows(self, mixed):
        """Without the filter this player would show 20 + 85 + 80 per game."""
        row = aggregate_to_season(mixed).iloc[0]
        assert row["pts"] == 80  # 4 games x 20
        assert row["min"] == 120  # 4 games x 30
        assert row["pts_pg"] == pytest.approx(20.0)

    def test_drop_helper_returns_only_player_rows(self, mixed):
        kept = drop_team_rows(mixed)
        assert len(kept) == 4
        assert kept["player_id"].notna().all()

    def test_an_unexpected_ratio_is_refused(self):
        """Two team rows per game is the known shape. A wild deviation means
        the file layout changed and the output should not be trusted."""
        rows = [game(1, "g0", 100, "NYL", min=30, pts=10)]
        rows += [self.team_row(f"t{i}", 100, "NYL", min=200, pts=80) for i in range(40)]
        with pytest.raises(SuspiciousRowMix, match="expected roughly"):
            drop_team_rows(pd.DataFrame(rows))

    def test_a_file_with_no_player_rows_is_refused(self):
        rows = [self.team_row(f"g{i}", 100, "NYL", min=200, pts=80) for i in range(2)]
        with pytest.raises(SuspiciousRowMix, match="no player rows"):
            drop_team_rows(pd.DataFrame(rows))


class TestEmptyAndDegenerate:
    def test_empty_frame_returns_empty(self):
        assert aggregate_to_season(pd.DataFrame()).empty

    def test_player_with_no_attempts_yields_nan_not_inf(self):
        logs = pd.DataFrame([game(1, "g1", 100, "NYL", min=5)])
        row = aggregate_to_season(logs).iloc[0]
        for column in ("ts_pct", "efg_pct", "fg3a_rate", "ftr", "ast_to"):
            assert np.isnan(row[column]), column
