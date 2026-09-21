"""Tests for franchise identity resolution.

Most of these encode things observed in the live data by spike 02, so they fail
against evidence rather than opinion if someone changes the model.
"""

from __future__ import annotations

import pytest

from courtvision.domain.franchise import (
    Franchise,
    FranchiseIdentity,
    FranchiseRegistry,
    RegistryInconsistent,
    UnknownFranchise,
)

PHOENIX = 1611661317
CONNECTICUT = 1611661323
VALKYRIES = 1611661331
TORONTO_UNKNOWN = 1611661999  # not in the registry; stands in for an expansion team


@pytest.fixture
def registry() -> FranchiseRegistry:
    return FranchiseRegistry.load()


@pytest.fixture
def strict_registry() -> FranchiseRegistry:
    return FranchiseRegistry.load(strict=True)


class TestPhoenixTheReferenceCase:
    """Observed by spike 02: one TEAM_ID, two abbreviations, no franchise change."""

    def test_pho_resolves_before_2025(self, registry):
        assert registry.label_for(PHOENIX, 2024, "PHO") == "PHO"

    def test_phx_resolves_from_2025(self, registry):
        assert registry.label_for(PHOENIX, 2025, "PHX") == "PHX"

    def test_both_labels_are_the_same_franchise(self, registry):
        before = registry.resolve(PHOENIX, 2024, "PHO")
        after = registry.resolve(PHOENIX, 2025, "PHX")
        assert before.team_id == after.team_id
        assert before.slug == after.slug == "phoenix-mercury"

    def test_the_name_never_changed(self, registry):
        franchise = registry.get(PHOENIX)
        names = {i.name for i in franchise.identities}
        assert names == {"Phoenix Mercury"}


class TestHistoricalLabeling:
    """Stats carry the label that was current when the games were played."""

    def test_connecticut_stays_connecticut_in_past_seasons(self, registry):
        assert registry.label_for(CONNECTICUT, 2025, "CON") == "CON"

    def test_connecticut_becomes_houston_in_2027(self, registry):
        assert registry.label_for(CONNECTICUT, 2027, "HOU") == "HOU"

    def test_it_is_one_continuous_franchise(self, registry):
        assert registry.resolve(CONNECTICUT, 2025, "CON").slug == (
            registry.resolve(CONNECTICUT, 2027, "HOU").slug
        )


class TestExpansionDoesNotBreakTheBuild:
    """A team ID the registry has never seen is an expansion team, not corruption."""

    def test_unknown_id_yields_a_provisional_franchise(self, registry):
        franchise = registry.resolve(TORONTO_UNKNOWN, 2026, "TOR")
        assert franchise.provisional is True
        assert franchise.team_id == TORONTO_UNKNOWN

    def test_unknown_id_still_labels_correctly(self, registry):
        assert registry.label_for(TORONTO_UNKNOWN, 2026, "TOR") == "TOR"

    def test_unknown_id_is_reported(self, registry):
        registry.resolve(TORONTO_UNKNOWN, 2026, "TOR")
        assert TORONTO_UNKNOWN in registry.report.unknown_team_ids
        assert not registry.report.is_clean()
        assert "Add it to franchises.yaml" in registry.report.summary()

    def test_strict_mode_refuses(self, strict_registry):
        with pytest.raises(UnknownFranchise, match="not in the franchise registry"):
            strict_registry.resolve(TORONTO_UNKNOWN, 2026, "TOR")

    def test_known_teams_are_unaffected_by_strict_mode(self, strict_registry):
        assert strict_registry.label_for(VALKYRIES, 2025, "GSV") == "GSV"


class TestDriftDetection:
    """If the data disagrees with the registry, the registry is stale."""

    def test_drift_is_recorded(self, registry):
        registry.resolve(PHOENIX, 2024, "PHX")  # registry expects PHO in 2024
        assert registry.report.abbreviation_drift
        assert "stale" in registry.report.summary()

    def test_matching_data_stays_clean(self, registry):
        registry.resolve(PHOENIX, 2024, "PHO")
        registry.resolve(VALKYRIES, 2025, "GSV")
        assert registry.report.is_clean()


class TestLineageBreaks:
    """One TEAM_ID spanning two unrelated franchises.

    The suspected real case is Portland: the original Fire played 2000 to 2002
    and folded, and the provider appears to have reused its identifier for the
    2026 expansion team that readopted the name. Spike 04 will settle it, but
    the mechanism has to exist and be correct before the answer arrives.
    """

    @pytest.fixture
    def revived(self) -> Franchise:
        return Franchise(
            team_id=1611661327,
            slug="portland-fire",
            identities=(
                FranchiseIdentity("POR", "Portland Fire", "Portland", 2000, 2002),
                FranchiseIdentity(
                    "PDX", "Portland Fire", "Portland", 2026, None, lineage_break=True
                ),
            ),
        )

    def test_two_eras(self, revived):
        assert revived.has_discontinuous_history
        assert len(revived.eras()) == 2

    def test_seasons_land_in_the_right_era(self, revived):
        assert revived.era_index_for(2001) == 0
        assert revived.era_index_for(2026) == 1

    def test_history_must_not_be_connected_across_the_break(self, revived):
        assert revived.crosses_lineage_break(2002, 2026) is True

    def test_within_an_era_history_connects(self, revived):
        assert revived.crosses_lineage_break(2000, 2002) is False

    def test_a_rename_is_not_a_lineage_break(self, registry):
        """Phoenix PHO to PHX is one continuous franchise, not two."""
        phoenix = registry.get(PHOENIX)
        assert not phoenix.has_discontinuous_history
        assert phoenix.crosses_lineage_break(2024, 2025) is False


class TestPortlandConfirmed:
    """Spike 04 confirmed the reuse against live data on Sep 20, 2026.

    TEAM_ID 1611661327 returned POR in 2000, 2001 and 2002, and returns PDX in
    2026. The provider reuses identifiers for revived franchise names, so
    TEAM_ID means "same provider identity", not "same franchise".
    """

    PORTLAND = 1611661327

    def test_the_registry_records_both_eras(self, registry):
        portland = registry.get(self.PORTLAND)
        assert portland.has_discontinuous_history
        assert len(portland.eras()) == 2

    def test_the_original_fire_ran_2000_to_2002(self, registry):
        first = registry.get(self.PORTLAND).eras()[0][0]
        assert (first.abbreviation, first.first_season, first.last_season) == (
            "POR",
            2000,
            2002,
        )

    def test_the_2026_fire_is_a_separate_franchise(self, registry):
        second = registry.get(self.PORTLAND).eras()[1][0]
        assert second.abbreviation == "PDX"
        assert second.first_season == 2026
        assert second.lineage_break is True

    def test_no_chart_may_connect_the_two_eras(self, registry):
        assert registry.get(self.PORTLAND).crosses_lineage_break(2002, 2026) is True

    def test_labels_are_era_correct(self, registry):
        assert registry.label_for(self.PORTLAND, 2001, "POR") == "POR"
        assert registry.label_for(self.PORTLAND, 2026, "PDX") == "PDX"

    def test_the_shared_name_is_flagged_as_a_collision(self, registry):
        """The subtle case: one ID, one name, two unrelated franchises.

        A check keyed on name alone or ID alone misses this entirely.
        """
        collisions = registry.names_reused_across_franchises()
        assert "Portland Fire" in collisions
        assert any("era" in entry for entry in collisions["Portland Fire"])


class TestNameReuse:
    """The Houston Comets problem: one name, two unrelated franchises."""

    def test_comets_collision_is_detected(self, registry):
        collisions = registry.names_reused_across_franchises()
        assert "Houston Comets" in collisions
        assert len(collisions["Houston Comets"]) >= 2

    def test_portland_fire_collision_is_detected(self, registry):
        collisions = registry.names_reused_across_franchises()
        assert "Portland Fire" in collisions

    def test_the_defunct_comets_are_recorded_separately(self, registry):
        gone = [d for d in registry.defunct if d.slug == "houston-comets-original"]
        assert len(gone) == 1
        assert gone[0].last_season == 2008

    def test_the_original_fire_is_not_in_defunct(self, registry):
        """It has a live successor identifier, so it belongs to the franchise
        record as era zero rather than to the defunct list. The defunct list is
        for franchises with no live ID at all."""
        assert not any(d.slug == "portland-fire-original" for d in registry.defunct)

    def test_folded_franchises_are_recorded(self, registry):
        """Confirmed from data by spike 04, covering 1997 through 2026."""
        expected = {
            "houston-comets-original": (1997, 2008),
            "charlotte-sting": (1997, 2006),
            "cleveland-rockers": (1997, 2003),
            "sacramento-monarchs": (1997, 2009),
            "miami-sol": (2000, 2002),
        }
        actual = {d.slug: (d.first_season, d.last_season) for d in registry.defunct}
        assert actual == expected


class TestRegistryIntegrity:
    def test_shipped_registry_loads_and_validates(self, registry):
        assert len(registry.all_franchises()) >= 13

    def test_overlapping_spans_are_rejected(self):
        bad = Franchise(
            team_id=1,
            slug="broken",
            identities=(
                FranchiseIdentity("AAA", "A", "A", 2000, 2010),
                FranchiseIdentity("BBB", "B", "B", 2005, None),
            ),
        )
        with pytest.raises(RegistryInconsistent, match="overlap"):
            FranchiseRegistry({1: bad})

    def test_open_ended_span_followed_by_another_is_rejected(self):
        bad = Franchise(
            team_id=1,
            slug="broken",
            identities=(
                FranchiseIdentity("AAA", "A", "A", 2000, None),
                FranchiseIdentity("BBB", "B", "B", 2011, None),
            ),
        )
        with pytest.raises(RegistryInconsistent, match="open ended"):
            FranchiseRegistry({1: bad})

    def test_every_live_franchise_has_a_current_identity(self, registry):
        for franchise in registry.all_franchises():
            assert franchise.current_identity().last_season is None
