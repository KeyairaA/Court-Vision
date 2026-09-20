"""Season identity: the one place that knows how a season string maps to a season.

WHY THIS MODULE EXISTS
----------------------
The WNBA plays inside a single calendar year, May to September. But nba_api
constrains its `Season` parameter to the NBA-style regex `^\\d{4}-\\d{2}$`, so
Court Vision is forced to send strings like '2024-25' for a league that has no
such thing as a 2024-25 season.

Which actual season '2024-25' resolves to is therefore genuinely ambiguous, and
getting it wrong is invisible: every chart would be labeled one season off and
nothing would look broken. Spike 01 resolves it empirically.

Until that spike has been run, the mapping below is an assumption, and this
module is deliberately the ONLY place that assumption lives. When the spike
reports back, flipping `SEASON_STRING_ANCHOR` is the entire change. Nothing else
in the pipeline needs to know.

The pipeline records `season_mapping_verified` in every artifact manifest, so a
site built on an unverified assumption says so rather than quietly implying
confidence it has not earned.
"""

from __future__ import annotations

import re
from enum import Enum

SEASON_STRING_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


class SeasonAnchor(str, Enum):
    """Which half of a 'YYYY-YY' string names the actual WNBA season."""

    LEADING = "leading"
    """'2024-25' means the 2024 season."""

    TRAILING = "trailing"
    """'2024-25' means the 2025 season."""


# ---------------------------------------------------------------------------
# SET BY SPIKE 01. Change this one value if the spike says otherwise.
# ---------------------------------------------------------------------------
SEASON_STRING_ANCHOR: SeasonAnchor = SeasonAnchor.LEADING

SEASON_MAPPING_VERIFIED: bool = True
"""VERIFIED Sep 20, 2026 by spike 01 against the live API.

Three independent signals agreed, each pinning a season string to a season whose
roster composition is public record:

    Caitlin Clark (first WNBA season 2024) first appears under '2024-25'
    Golden State Valkyries (debut 2025)    first appear  under '2025-26'
    Toronto and Portland (debut 2026)      first appear  under '2026-27'

In every case the actual season equals the LEADING year of the string. The
notebook's original `Year = year - 1` labeling was therefore correct, since
`year - 1` is exactly that leading component.

This flag is surfaced in the artifact manifest, so the site can state that its
season labels are verified rather than assumed.
"""
# ---------------------------------------------------------------------------


class InvalidSeasonString(ValueError):
    """Raised when a season string does not match the required 'YYYY-YY' shape."""


def season_string(year: int) -> str:
    """Build the API season string for a given WNBA season year.

    >>> season_string(2024)  # under the LEADING anchor
    '2024-25'
    """
    if year < 1997:
        raise ValueError(f"The WNBA did not exist in {year}; first season was 1997.")

    if SEASON_STRING_ANCHOR is SeasonAnchor.LEADING:
        lead = year
    else:
        lead = year - 1

    return f"{lead}-{str(lead + 1)[-2:]}"


def season_year(season_str: str) -> int:
    """Recover the WNBA season year from an API season string.

    Inverse of :func:`season_string`.

    >>> season_year("2024-25")  # under the LEADING anchor
    2024
    """
    match = SEASON_STRING_PATTERN.match(season_str)
    if match is None:
        raise InvalidSeasonString(
            f"{season_str!r} is not a valid season string; expected 'YYYY-YY'."
        )

    lead = int(match.group(1))
    trailing_two = int(match.group(2))

    # Guard against a malformed pair like '2024-99' that matches the regex but
    # is not a real consecutive-year span.
    expected_trailing = (lead + 1) % 100
    if trailing_two != expected_trailing:
        raise InvalidSeasonString(
            f"{season_str!r} does not span consecutive years; "
            f"expected '{lead}-{expected_trailing:02d}'."
        )

    return lead if SEASON_STRING_ANCHOR is SeasonAnchor.LEADING else lead + 1


def season_range(start_year: int, end_year: int) -> list[int]:
    """Inclusive list of season years, oldest first."""
    if end_year < start_year:
        raise ValueError(f"end_year {end_year} is before start_year {start_year}.")
    return list(range(start_year, end_year + 1))
