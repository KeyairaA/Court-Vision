"""Tests for the metric formulas.

These are golden-value tests: the expected numbers were worked out by hand from
the published definitions, not captured from a previous run. That distinction
matters, because a test that records whatever the code currently produces will
happily lock in a bug.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from courtvision.metrics.rates import (
    FREE_THROW_ATTEMPT_COEFFICIENT,
    add_per_game_metrics,
    add_per_minute_metrics,
    add_rate_metrics,
    assist_to_turnover,
    effective_fg_pct,
    free_throw_rate,
    per_minutes,
    three_point_attempt_rate,
    true_shooting_pct,
)


def s(*values: float) -> pd.Series:
    return pd.Series(list(values), dtype="float64")


class TestTrueShooting:
    def test_hand_worked_value(self):
        """pts=100, fga=80, fta=20

        TS = 100 / (2 * (80 + 0.44 * 20))
           = 100 / (2 * 88.8)
           = 100 / 177.6
           = 0.5630630...
        """
        result = true_shooting_pct(s(100), s(80), s(20))
        assert result.iloc[0] == pytest.approx(0.56306306, abs=1e-8)

    def test_no_free_throws_reduces_to_points_per_two_attempts(self):
        """With fta=0, TS% is just pts / (2 * fga)."""
        result = true_shooting_pct(s(50), s(50), s(0))
        assert result.iloc[0] == pytest.approx(0.5)

    def test_zero_attempts_is_nan_not_inf(self):
        result = true_shooting_pct(s(0), s(0), s(0))
        assert np.isnan(result.iloc[0])
        assert not np.isinf(result.iloc[0])

    def test_coefficient_is_the_convention(self):
        assert FREE_THROW_ATTEMPT_COEFFICIENT == 0.44

    def test_the_old_coefficient_gives_a_different_answer(self):
        """The Streamlit app used 0.475. Measured on 2017 data, that reorders
        51 of 99 qualified players, so the two are not interchangeable."""
        standard = true_shooting_pct(s(100), s(80), s(20))
        legacy = true_shooting_pct(s(100), s(80), s(20), ft_coefficient=0.475)
        assert standard.iloc[0] != legacy.iloc[0]
        assert standard.iloc[0] > legacy.iloc[0]


class TestEffectiveFieldGoal:
    def test_hand_worked_value(self):
        """fgm=40, fg3m=10, fga=100 -> (40 + 5) / 100 = 0.45"""
        assert effective_fg_pct(s(40), s(10), s(100)).iloc[0] == pytest.approx(0.45)

    def test_no_threes_equals_plain_fg_pct(self):
        assert effective_fg_pct(s(50), s(0), s(100)).iloc[0] == pytest.approx(0.5)

    def test_zero_attempts_is_nan(self):
        assert np.isnan(effective_fg_pct(s(0), s(0), s(0)).iloc[0])


class TestThreePointAttemptRate:
    def test_hand_worked_value(self):
        assert three_point_attempt_rate(s(30), s(100)).iloc[0] == pytest.approx(0.30)

    def test_it_is_not_three_point_percentage(self):
        """The notebook originally defined this as FG3M / FG3A, making it an
        exact duplicate of 3PT%. It measures shot selection, not accuracy."""
        fg3m, fg3a, fga = s(9), s(30), s(100)
        accuracy = (fg3m / fg3a).iloc[0]
        selection = three_point_attempt_rate(fg3a, fga).iloc[0]
        assert accuracy == pytest.approx(0.30)
        assert selection == pytest.approx(0.30)
        # Numerically equal by coincidence above; prove they diverge in general.
        assert three_point_attempt_rate(s(50), s(100)).iloc[0] != (s(9) / s(50)).iloc[0]

    def test_zero_attempts_is_nan(self):
        assert np.isnan(three_point_attempt_rate(s(0), s(0)).iloc[0])


class TestFreeThrowRate:
    def test_hand_worked_value(self):
        assert free_throw_rate(s(25), s(100)).iloc[0] == pytest.approx(0.25)

    def test_zero_attempts_is_nan(self):
        assert np.isnan(free_throw_rate(s(5), s(0)).iloc[0])


class TestAssistToTurnover:
    def test_hand_worked_value(self):
        assert assist_to_turnover(s(60), s(30)).iloc[0] == pytest.approx(2.0)

    def test_zero_turnovers_is_nan_not_infinite(self):
        """A player with 2 assists and 0 turnovers does not have infinitely
        good ball security. The sample is too small to say anything."""
        result = assist_to_turnover(s(2), s(0))
        assert np.isnan(result.iloc[0])
        assert not np.isinf(result.iloc[0])


class TestPerMinutes:
    def test_per_36_hand_worked(self):
        """18 points in 24 minutes -> 18 / 24 * 36 = 27.0"""
        assert per_minutes(s(18), s(24)).iloc[0] == pytest.approx(27.0)

    def test_base_one_is_raw_per_minute(self):
        assert per_minutes(s(18), s(24), base=1).iloc[0] == pytest.approx(0.75)

    def test_zero_minutes_is_nan(self):
        assert np.isnan(per_minutes(s(5), s(0)).iloc[0])

    def test_non_positive_base_rejected(self):
        with pytest.raises(ValueError, match="base must be positive"):
            per_minutes(s(1), s(1), base=0)


@pytest.fixture
def totals() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "player_id": [1, 2],
            "gp": [30, 10],
            "min": [900.0, 120.0],
            "fgm": [200.0, 0.0],
            "fga": [450.0, 0.0],
            "fg3m": [50.0, 0.0],
            "fg3a": [150.0, 0.0],
            "ftm": [90.0, 0.0],
            "fta": [110.0, 0.0],
            "oreb": [30.0, 5.0],
            "dreb": [120.0, 10.0],
            "reb": [150.0, 15.0],
            "ast": [120.0, 4.0],
            "stl": [40.0, 2.0],
            "blk": [20.0, 1.0],
            "tov": [60.0, 0.0],
            "pts": [540.0, 0.0],
        }
    )


class TestFrameHelpers:
    def test_rate_columns_are_added(self, totals):
        out = add_rate_metrics(totals)
        for column in ("ts_pct", "efg_pct", "fg3a_rate", "ftr", "ast_to"):
            assert column in out.columns

    def test_rates_are_correct_for_the_real_player(self, totals):
        out = add_rate_metrics(totals)
        row = out.iloc[0]
        # TS = 540 / (2 * (450 + 0.44 * 110)) = 540 / (2 * 498.4) = 0.541733...
        assert row["ts_pct"] == pytest.approx(0.54173355, abs=1e-8)
        # eFG = (200 + 25) / 450 = 0.5
        assert row["efg_pct"] == pytest.approx(0.5)
        # 3PAr = 150 / 450
        assert row["fg3a_rate"] == pytest.approx(1 / 3)
        # FTr = 110 / 450
        assert row["ftr"] == pytest.approx(110 / 450)
        # AST/TOV = 120 / 60
        assert row["ast_to"] == pytest.approx(2.0)

    def test_the_zero_attempt_player_yields_nan_everywhere(self, totals):
        """This is the row that would produce inf and poison a correlation
        matrix while still rendering as a perfectly normal-looking chart."""
        out = add_rate_metrics(totals)
        row = out.iloc[1]
        for column in ("ts_pct", "efg_pct", "fg3a_rate", "ftr", "ast_to"):
            assert np.isnan(row[column]), column
            assert not np.isinf(row[column]), column

    def test_no_infinities_anywhere(self, totals):
        out = add_per_minute_metrics(add_per_game_metrics(add_rate_metrics(totals)))
        numeric = out.select_dtypes(include=[np.number])
        assert not np.isinf(numeric.to_numpy()).any()

    def test_per_game_hand_worked(self, totals):
        out = add_per_game_metrics(totals)
        # 540 points over 30 games
        assert out.iloc[0]["pts_pg"] == pytest.approx(18.0)
        assert out.iloc[0]["min_pg"] == pytest.approx(30.0)

    def test_per_36_hand_worked(self, totals):
        out = add_per_minute_metrics(totals)
        # 540 points in 900 minutes -> 21.6 per 36
        assert out.iloc[0]["pts_per36"] == pytest.approx(21.6)

    def test_originals_are_untouched(self, totals):
        before = totals.copy()
        add_rate_metrics(totals)
        pd.testing.assert_frame_equal(totals, before)
