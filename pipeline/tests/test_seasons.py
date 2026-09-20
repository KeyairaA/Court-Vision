"""Tests for season identity.

The point of these is that the season mapping is the single most dangerous
assumption in the project: if it is wrong, every chart is mislabeled by a year
and nothing looks broken. These tests do not prove the mapping is correct,
because only spike 01 against the live API can do that. What they prove is that
the mapping is internally consistent and that flipping the anchor flips
everything together, so the spike result can be applied in one place.
"""

from __future__ import annotations

import pytest

from courtvision.domain import seasons
from courtvision.domain.seasons import (
    InvalidSeasonString,
    SeasonAnchor,
    season_range,
    season_string,
    season_year,
)


@pytest.fixture
def leading(monkeypatch):
    monkeypatch.setattr(seasons, "SEASON_STRING_ANCHOR", SeasonAnchor.LEADING)


@pytest.fixture
def trailing(monkeypatch):
    monkeypatch.setattr(seasons, "SEASON_STRING_ANCHOR", SeasonAnchor.TRAILING)


class TestLeadingAnchor:
    def test_season_string(self, leading):
        assert season_string(2024) == "2024-25"
        assert season_string(2019) == "2019-20"

    def test_season_year(self, leading):
        assert season_year("2024-25") == 2024
        assert season_year("2019-20") == 2019

    def test_century_rollover(self, leading):
        assert season_string(2099) == "2099-00"
        assert season_year("2099-00") == 2099


class TestTrailingAnchor:
    def test_season_string(self, trailing):
        assert season_string(2025) == "2024-25"

    def test_season_year(self, trailing):
        assert season_year("2024-25") == 2025


class TestRoundTrip:
    """Whichever anchor is configured, the two functions must be inverses.

    This is the property that lets the spike result be a one-line change: if
    round-tripping holds under both anchors, flipping the anchor cannot leave
    half the pipeline on the old interpretation.
    """

    @pytest.mark.parametrize("anchor", [SeasonAnchor.LEADING, SeasonAnchor.TRAILING])
    @pytest.mark.parametrize("year", [1997, 2005, 2019, 2024, 2025, 2026, 2030])
    def test_round_trip(self, monkeypatch, anchor, year):
        monkeypatch.setattr(seasons, "SEASON_STRING_ANCHOR", anchor)
        assert season_year(season_string(year)) == year


class TestRejectsGarbage:
    @pytest.mark.parametrize(
        "bad",
        ["2024", "24-25", "2024-2025", "", "abcd-ef", "2024_25", "2024-5"],
    )
    def test_malformed_shape(self, bad):
        with pytest.raises(InvalidSeasonString):
            season_year(bad)

    def test_non_consecutive_years(self):
        """'2024-99' matches the regex but is not a real season span."""
        with pytest.raises(InvalidSeasonString):
            season_year("2024-99")

    def test_before_the_league_existed(self):
        with pytest.raises(ValueError, match="did not exist"):
            season_string(1996)


class TestSeasonRange:
    def test_inclusive_and_ordered(self):
        assert season_range(2019, 2022) == [2019, 2020, 2021, 2022]

    def test_single_year(self):
        assert season_range(2024, 2024) == [2024]

    def test_reversed_bounds_rejected(self):
        with pytest.raises(ValueError, match="before"):
            season_range(2025, 2019)


class TestVerifiedAgainstLiveData:
    """Locks in what spike 01 actually observed on Sep 20, 2026.

    These are the real anchors from the live API, and they are the reason the
    configured anchor is LEADING. If someone changes SEASON_STRING_ANCHOR, these
    fail loudly and point at the evidence rather than at an opinion.
    """

    def test_mapping_is_verified(self):
        assert seasons.SEASON_MAPPING_VERIFIED is True

    def test_anchor_is_leading(self):
        assert seasons.SEASON_STRING_ANCHOR is SeasonAnchor.LEADING

    @pytest.mark.parametrize(
        ("season", "expected_string", "evidence"),
        [
            (2024, "2024-25", "Caitlin Clark's rookie season"),
            (2025, "2025-26", "Golden State Valkyries debut"),
            (2026, "2026-27", "Toronto Tempo and Portland Fire debut"),
        ],
    )
    def test_observed_anchors(self, season, expected_string, evidence):
        assert season_string(season) == expected_string, evidence
        assert season_year(expected_string) == season, evidence
