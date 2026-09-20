"""Franchise identity resolution.

Separates what a franchise IS from how it was LABELED in a given season.

The premise was proven empirically by spike 02: `TEAM_ID` 1611661317 carried the
abbreviation `PHO` from 2018 through 2024 and `PHX` from 2025 onward, with no
franchise change behind it. The provider simply changed a string. Anything keyed
on the abbreviation splits Phoenix into two teams at that boundary.

A DELIBERATE REVERSAL
---------------------
An earlier design note said the pipeline should "fail loudly on an unrecognized
team ID." On reflection that is wrong, and this module does the opposite.

An unknown team ID is not a corruption signal. It is what a WNBA expansion team
looks like on the day it first plays, and the league has three more scheduled
through 2030. Hard-failing would take a live site down for a predictable, benign,
calendar-driven event. So the resolver synthesizes a provisional franchise from
the observed abbreviation, and the build reports it prominently. A new team is a
visual to-do, not an outage.

Strict mode exists for CI, where an unknown franchise SHOULD fail the run, so
that the registry gets updated deliberately rather than drifting forever behind
a stream of provisional entries nobody notices.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

DEFAULT_REGISTRY_PATH = Path(__file__).resolve().parent.parent / "data" / "franchises.yaml"


class UnknownFranchise(LookupError):
    """Raised in strict mode when a team ID is absent from the registry."""


class RegistryInconsistent(ValueError):
    """The registry contradicts itself, e.g. overlapping identity spans."""


@dataclass(frozen=True)
class FranchiseIdentity:
    """How a franchise presented itself across a span of seasons."""

    abbreviation: str
    name: str
    city: str
    first_season: int
    last_season: int | None = None
    verified: bool = True

    lineage_break: bool = False
    """This identity begins a NEW franchise era under the same TEAM_ID.

    Set when the provider reuses one identifier for two franchises that are not
    continuous in the real world. The suspected case is Portland: the original
    Fire played 2000 to 2002 and folded, and the 2026 Fire is an expansion team
    that readopted the name 24 years later. They are not the same franchise, and
    no chart may draw a line across that boundary.

    A lineage break is not the same as a rename. Phoenix going from PHO to PHX is
    one continuous franchise relabeled. A lineage break is two franchises that
    happen to share an identifier.
    """

    def covers(self, season: int) -> bool:
        if season < self.first_season:
            return False
        return self.last_season is None or season <= self.last_season


@dataclass(frozen=True)
class Franchise:
    team_id: int
    slug: str
    identities: tuple[FranchiseIdentity, ...]
    provisional: bool = False
    """True when synthesized from observed data rather than read from the registry."""

    def identity_for(self, season: int) -> FranchiseIdentity:
        for identity in self.identities:
            if identity.covers(season):
                return identity
        # Outside every recorded span. Fall back to the nearest one rather than
        # failing, since a chart labeling a team is never worth an exception.
        if season < self.identities[0].first_season:
            return self.identities[0]
        return self.identities[-1]

    def current_identity(self) -> FranchiseIdentity:
        for identity in reversed(self.identities):
            if identity.last_season is None:
                return identity
        return self.identities[-1]

    def eras(self) -> tuple[tuple[FranchiseIdentity, ...], ...]:
        """Group identities into continuous franchise eras.

        Renames stay within an era. A `lineage_break` starts a new one, because
        the identifier is being reused by an unrelated franchise.
        """
        grouped: list[list[FranchiseIdentity]] = []
        for identity in self.identities:
            if identity.lineage_break or not grouped:
                grouped.append([identity])
            else:
                grouped[-1].append(identity)
        return tuple(tuple(era) for era in grouped)

    def era_index_for(self, season: int) -> int:
        """Which continuous era a season belongs to. Seasons in different eras
        are different franchises that merely share a TEAM_ID."""
        for index, era in enumerate(self.eras()):
            first = era[0].first_season
            last = era[-1].last_season
            if season >= first and (last is None or season <= last):
                return index
        return 0 if season < self.identities[0].first_season else len(self.eras()) - 1

    def crosses_lineage_break(self, season_a: int, season_b: int) -> bool:
        """True when two seasons belong to different franchise eras.

        Chart code must call this before connecting two points for the same
        TEAM_ID. Drawing a trend line from the 2002 Portland Fire to the 2026
        Portland Fire would assert a continuity that does not exist.
        """
        return self.era_index_for(season_a) != self.era_index_for(season_b)

    @property
    def has_discontinuous_history(self) -> bool:
        return len(self.eras()) > 1


@dataclass(frozen=True)
class DefunctFranchise:
    """A franchise that folded, recorded so a reused name is never read as continuous."""

    slug: str
    name: str
    city: str
    abbreviation: str
    first_season: int
    last_season: int
    team_id: int | None = None
    note: str = ""


@dataclass
class ResolutionReport:
    """What the resolver noticed during a build. Surfaced in the manifest."""

    unknown_team_ids: dict[int, str] = field(default_factory=dict)
    """team_id -> abbreviation observed in the data but absent from the registry."""

    abbreviation_drift: list[tuple[int, int, str, str]] = field(default_factory=list)
    """(team_id, season, registry_abbreviation, observed_abbreviation)."""

    def is_clean(self) -> bool:
        return not self.unknown_team_ids and not self.abbreviation_drift

    def summary(self) -> str:
        if self.is_clean():
            return "Franchise registry matched the data exactly."
        lines = []
        for team_id, abbr in sorted(self.unknown_team_ids.items()):
            lines.append(
                f"Unknown franchise: TEAM_ID {team_id} (seen as {abbr}). "
                f"Add it to franchises.yaml."
            )
        for team_id, season, expected, observed in self.abbreviation_drift:
            lines.append(
                f"Abbreviation drift: TEAM_ID {team_id} in {season} is "
                f"{observed!r} but the registry says {expected!r}. "
                f"The registry is stale."
            )
        return "\n".join(lines)


class FranchiseRegistry:
    def __init__(
        self,
        franchises: dict[int, Franchise],
        defunct: tuple[DefunctFranchise, ...] = (),
        strict: bool = False,
    ) -> None:
        self._franchises = dict(franchises)
        self.defunct = defunct
        self.strict = strict
        self.report = ResolutionReport()
        self._validate()

    # -- construction -------------------------------------------------------

    @classmethod
    def load(
        cls, path: Path | None = None, strict: bool = False
    ) -> FranchiseRegistry:
        path = path or DEFAULT_REGISTRY_PATH
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))

        franchises: dict[int, Franchise] = {}
        for entry in raw.get("franchises") or []:
            identities = tuple(
                FranchiseIdentity(
                    abbreviation=str(i["abbreviation"]).upper(),
                    name=i["name"],
                    city=i["city"],
                    first_season=int(i["first_season"]),
                    last_season=None if i.get("last_season") is None else int(i["last_season"]),
                    verified=bool(i.get("verified", True)),
                    lineage_break=bool(i.get("lineage_break", False)),
                )
                for i in entry["identities"]
            )
            identities = tuple(sorted(identities, key=lambda i: i.first_season))
            team_id = int(entry["team_id"])
            franchises[team_id] = Franchise(
                team_id=team_id, slug=entry["slug"], identities=identities
            )

        defunct = tuple(
            DefunctFranchise(
                slug=d["slug"],
                name=d["name"],
                city=d["city"],
                abbreviation=str(d["abbreviation"]).upper(),
                first_season=int(d["first_season"]),
                last_season=int(d["last_season"]),
                team_id=None if d.get("team_id") is None else int(d["team_id"]),
                note=d.get("note", "").strip(),
            )
            for d in (raw.get("defunct") or [])
        )

        return cls(franchises, defunct=defunct, strict=strict)

    def _validate(self) -> None:
        """Catch a registry that contradicts itself before it reaches a chart."""
        for franchise in self._franchises.values():
            spans = franchise.identities
            for earlier, later in zip(spans, spans[1:], strict=False):
                if earlier.last_season is None:
                    raise RegistryInconsistent(
                        f"{franchise.slug}: identity {earlier.abbreviation} is open ended "
                        f"but is followed by {later.abbreviation}."
                    )
                if later.first_season <= earlier.last_season:
                    raise RegistryInconsistent(
                        f"{franchise.slug}: {earlier.abbreviation} ends {earlier.last_season} "
                        f"but {later.abbreviation} starts {later.first_season}; spans overlap."
                    )

        slugs = [f.slug for f in self._franchises.values()]
        if len(slugs) != len(set(slugs)):
            raise RegistryInconsistent("Duplicate franchise slug in the registry.")

    # -- resolution ---------------------------------------------------------

    def resolve(
        self, team_id: int, season: int, observed_abbreviation: str
    ) -> Franchise:
        """Resolve a data row's team to a franchise.

        An unknown team ID yields a provisional franchise rather than an error,
        unless strict mode is on. See the module docstring.
        """
        observed = observed_abbreviation.strip().upper()
        franchise = self._franchises.get(team_id)

        if franchise is None:
            if self.strict:
                raise UnknownFranchise(
                    f"TEAM_ID {team_id} (seen as {observed!r} in {season}) is not in the "
                    f"franchise registry. Add it to franchises.yaml, or run without "
                    f"strict mode to treat it as provisional."
                )
            self.report.unknown_team_ids[team_id] = observed
            logger.warning(
                "Unknown TEAM_ID %s seen as %s in %s; treating as provisional.",
                team_id,
                observed,
                season,
            )
            return self._provisional(team_id, season, observed)

        identity = franchise.identity_for(season)
        if identity.abbreviation != observed:
            drift = (team_id, season, identity.abbreviation, observed)
            if drift not in self.report.abbreviation_drift:
                self.report.abbreviation_drift.append(drift)
                logger.warning(
                    "Abbreviation drift: TEAM_ID %s in %s is %r, registry says %r.",
                    team_id,
                    season,
                    observed,
                    identity.abbreviation,
                )
        return franchise

    def label_for(self, team_id: int, season: int, observed_abbreviation: str) -> str:
        """The abbreviation to display for this team in this season.

        Statistics are labeled with the identity that was current when the games
        were played. A 2025 row for the Connecticut Sun reads CON even after the
        franchise becomes the Houston Comets, because that is what the team was
        called. Lineage views label by franchise instead.
        """
        franchise = self.resolve(team_id, season, observed_abbreviation)
        if franchise.provisional:
            return observed_abbreviation.strip().upper()
        return franchise.identity_for(season).abbreviation

    def _provisional(self, team_id: int, season: int, observed: str) -> Franchise:
        return Franchise(
            team_id=team_id,
            slug=f"unknown-{team_id}",
            identities=(
                FranchiseIdentity(
                    abbreviation=observed,
                    name=observed,
                    city="",
                    first_season=season,
                    last_season=None,
                    verified=False,
                ),
            ),
            provisional=True,
        )

    # -- lookups ------------------------------------------------------------

    def get(self, team_id: int) -> Franchise | None:
        return self._franchises.get(team_id)

    def all_franchises(self) -> tuple[Franchise, ...]:
        return tuple(self._franchises.values())

    def names_reused_across_franchises(self) -> dict[str, list[str]]:
        """Names that refer to more than one franchise, in any of three ways.

        Any view that groups by name rather than by franchise era will merge
        teams that have nothing to do with each other.

        The three shapes, all of which occur in real WNBA data:

        1. A live franchise and a defunct one share a name. The Houston Comets:
           the 1997-2008 franchise folded, and the 2027 Comets are a relocated
           Connecticut team wearing the brand.

        2. Two live franchises share a name. Not currently present, but nothing
           prevents it.

        3. One TEAM_ID spans a lineage break. The Portland Fire: the same
           identifier covers the 2000-2002 franchise that folded and the 2026
           expansion team that readopted the name. This is the subtle case,
           because a naive check keyed on either name or ID misses it.
        """
        live: dict[str, list[str]] = {}
        for franchise in self._franchises.values():
            for identity in franchise.identities:
                live.setdefault(identity.name, []).append(franchise.slug)

        collisions: dict[str, list[str]] = {}

        for gone in self.defunct:
            if gone.name in live:
                collisions[gone.name] = sorted({*live[gone.name], gone.slug})

        for name, slugs in live.items():
            if len(set(slugs)) > 1:
                collisions.setdefault(name, sorted(set(slugs)))

        # Shape 3: the same name on both sides of a lineage break.
        for franchise in self._franchises.values():
            if not franchise.has_discontinuous_history:
                continue
            eras = franchise.eras()
            for index, era in enumerate(eras):
                for identity in era:
                    others = {
                        other.name
                        for other_index, other_era in enumerate(eras)
                        if other_index != index
                        for other in other_era
                    }
                    if identity.name in others:
                        label = f"{franchise.slug}#era{index}"
                        existing = collisions.setdefault(identity.name, [])
                        if label not in existing:
                            existing.append(label)

        return {name: sorted(slugs) for name, slugs in collisions.items()}
