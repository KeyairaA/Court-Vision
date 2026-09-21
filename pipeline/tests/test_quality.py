"""Tests for completeness and reconciliation, and for gap filling.

Both gates exist because of real-data findings: 2026 player rows stopped on
July 22 while team rows ran to the end of the season, and player rows reconcile
exactly to team rows for every stat except turnovers.
"""

from __future__ import annotations

import pandas as pd
import pytest

from courtvision.domain.schema import SEASON_TYPE_REGULAR
from courtvision.ingest.boxscores import (
    FillFailed,
    boxscores_to_game_logs,
    fill_gaps,
    parse_minutes,
)
from courtvision.transform.quality import reconcile, season_coverage
from tests.conftest import boxscores_from, make_season

REG = SEASON_TYPE_REGULAR


class TestCoverage:
    def test_complete_season(self, season_logs):
        cov = season_coverage(season_logs, 2026, REG)
        assert cov.complete
        assert cov.games_played == cov.games_covered == 4
        assert cov.ratio == 1.0

    def test_the_2026_shape_is_detected(self):
        """Team rows for every game, player rows stopping partway."""
        logs = make_season(games=10, drop_player_rows_after=6)
        cov = season_coverage(logs, 2026, REG)
        assert not cov.complete
        assert (cov.games_played, cov.games_covered) == (10, 6)
        assert len(cov.missing_game_ids) == 4
        assert cov.last_covered_date < cov.last_played_date

    def test_a_forfeit_is_not_a_missing_game(self):
        """Aug 3 2018, WAS vs LVA: team rows with zero minutes, no player rows."""
        logs = make_season(games=3)
        forfeit = logs[
            (logs["player_id"].isna()) & (logs["game_id"] == logs["game_id"].iloc[0])
        ].copy()
        forfeit["game_id"] = "1018FORFEIT"
        for column in ("min", "pts", "fga"):
            forfeit[column] = 0.0
        cov = season_coverage(pd.concat([logs, forfeit], ignore_index=True), 2026, REG)
        assert cov.complete
        assert cov.forfeit_game_ids == ["1018FORFEIT"]
        assert cov.games_played == 3


class TestReconciliation:
    def test_real_shaped_data_reconciles(self, season_logs):
        recon = reconcile(season_logs, REG)
        assert recon.clean
        assert recon.team_games_compared == 8

    def test_team_turnovers_above_player_sum_are_allowed(self):
        """Shot-clock violations are charged to the team, not a player."""
        assert reconcile(make_season(team_turnovers=6), REG).clean

    def test_team_turnovers_below_player_sum_are_corruption(self):
        assert not reconcile(make_season(team_turnovers=-1), REG).clean

    @pytest.mark.parametrize("stat", ["pts", "fga", "fg3m", "reb", "ast", "blk"])
    def test_any_exact_stat_mismatch_is_caught(self, season_logs, stat):
        corrupt = season_logs.copy()
        idx = corrupt[corrupt["player_id"].notna()].index[0]
        corrupt.loc[idx, stat] += 1
        recon = reconcile(corrupt, REG)
        assert not recon.clean
        assert recon.mismatches[0]["stat"] == stat


class TestMinutesParsing:
    @pytest.mark.parametrize(("raw", "expected"), [("28:30", 28.5), ("0:45", 0.75), ("12", 12.0)])
    def test_values(self, raw, expected):
        assert parse_minutes(raw) == pytest.approx(expected)

    @pytest.mark.parametrize("raw", ["", None, "   ", "nan"])
    def test_blank_means_did_not_play(self, raw):
        assert parse_minutes(raw) is None


class TestGapFill:
    @pytest.fixture
    def gapped(self) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
        full = make_season(games=10)
        box = boxscores_from(full)
        gapped = make_season(games=10, drop_player_rows_after=6)
        missing = season_coverage(gapped, 2026, REG).missing_game_ids
        return gapped, box, missing

    def test_fill_restores_full_coverage(self, gapped):
        logs, box, missing = gapped
        filled = fill_gaps(logs, box, missing)
        assert season_coverage(filled, 2026, REG).complete

    def test_filled_rows_reconcile_with_team_rows_they_did_not_come_from(self, gapped):
        """The whole reason the fill can be trusted."""
        logs, box, missing = gapped
        assert reconcile(fill_gaps(logs, box, missing), REG).clean

    def test_dnp_rows_are_not_credited_with_games(self, gapped):
        """Rows of zeros reconcile perfectly, so this has to be caught directly."""
        logs, box, missing = gapped
        converted = boxscores_to_game_logs(box, logs, missing)
        assert not (converted["player_id"] >= 900000).any()

    def test_only_missing_games_are_filled(self, gapped):
        logs, box, missing = gapped
        converted = boxscores_to_game_logs(box, logs, missing)
        assert set(converted["game_id"]) == set(missing)

    def test_filled_rows_take_labels_from_team_rows(self, gapped):
        logs, box, missing = gapped
        converted = boxscores_to_game_logs(box, logs, missing)
        assert converted["season_type"].eq("regular-season").all()
        assert converted["game_date"].notna().all()

    def test_game_log_name_spelling_wins(self, gapped):
        logs, box, missing = gapped
        box = box.copy()
        box.loc[box["person_id"] == box["person_id"].iloc[0], "first_name"] = "DIFFERENT"
        converted = boxscores_to_game_logs(box, logs, missing)
        pid = int(box["person_id"].iloc[0])
        expected = logs[logs["player_id"] == pid]["player_name"].iloc[0]
        assert set(converted[converted["player_id"] == pid]["player_name"]) == {expected}

    def test_rows_for_unknown_games_are_refused(self, gapped):
        logs, box, missing = gapped
        box = box.copy()
        box.loc[box["game_id"] == missing[0], "team_id"] = 42
        with pytest.raises(FillFailed, match="disagree"):
            boxscores_to_game_logs(box, logs, missing)

    def test_no_missing_games_is_a_no_op(self, season_logs):
        assert fill_gaps(season_logs, pd.DataFrame(), []) is season_logs
