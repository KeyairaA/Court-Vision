"""Pipeline configuration.

Deliberately free of wall-clock logic. The notebook derived its season window
from `datetime.now().year`, which knows nothing about which seasons actually
exist: run in September 2026 it silently omits the 2026 season that has just
finished, and it shifts the window on January 1 for no basketball reason.

The window here is explicit. Spike 01 reports which seasons the API actually
serves, and `LATEST_SEASON` is updated from that rather than inferred from a
clock.
"""

from __future__ import annotations

from pathlib import Path

WNBA_LEAGUE_ID = "10"
"""nba_api routes WNBA requests to stats.nba.com with this LeagueID.

Note the host: it is stats.nba.com, NOT stats.wnba.com. Verified from the
request URL of a failed call. This is the host that must be reachable from
wherever the scheduled refresh runs.
"""

STATS_HOST = "stats.nba.com"

SEASON_TYPE_REGULAR = "Regular Season"
PER_MODE = "PerGame"

# --- Season window ---------------------------------------------------------
# Set from spike output (Sep 20, 2026), never from the system clock.
#
# Spike 04 established the API serves the COMPLETE league history, 1997 through
# 2026. The seven-season framing the project inherited came from the old Excel
# file, not from any real constraint.
EARLIEST_AVAILABLE_SEASON = 1997
LATEST_SEASON = 2026

# Decision (Sep 20, 2026): cover the modern era, ten seasons, 2017 through 2026.
#
# The full 30 seasons are available and remain available later. Ten was chosen
# to skip the volatile 1997-2010 stretch, when the league went from 8 teams to
# 16 and contracted to 12 with five franchises folding, which makes every
# long-run league average as much a story about composition as about basketball.
#
# The window is deliberately not the whole stable era either. 2017-2026 gives a
# clean baseline of 12 teams through 2024, then the current expansion, and it
# contains the San Antonio to Las Vegas relocation so franchise continuity is
# exercised by real data inside the window rather than only at its edges.
WINDOW_LENGTH = 10

EARLIEST_SEASON = LATEST_SEASON - WINDOW_LENGTH + 1

# Seasons whose league-average movements are structural rather than stylistic,
# and must be annotated rather than read as changes in how the game is played.
CONFOUNDED_SEASONS: dict[int, str] = {
    2020: "COVID-shortened 22-game season played in a single-site bubble",
    2025: "Expansion to 13 teams (Golden State Valkyries)",
    2026: "Expansion to 15 teams (Toronto Tempo, Portland Fire)",
}

# Relocations and rebrands inside the window. Not confounds, but worth surfacing
# so a reader is not confused by a team appearing under a new label mid-chart.
LABEL_CHANGES_IN_WINDOW: dict[int, str] = {
    2018: "San Antonio Stars (SAN) become the Las Vegas Aces (LVA)",
    2025: "Phoenix abbreviation changes from PHO to PHX at the data provider",
}

# --- Network ---------------------------------------------------------------
REQUEST_TIMEOUT_SECONDS = 45
MAX_RETRIES = 4
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_MAX_SECONDS = 30.0
PAUSE_BETWEEN_SEASONS_SECONDS = 1.5
"""The stats endpoint throttles. Pace sequential season pulls rather than
hammering it and getting the whole refresh blocked."""

# --- Analysis --------------------------------------------------------------
MIN_MINUTES_THRESHOLD = 10
"""Players below this are excluded from per-minute normalization, so that
low-usage bench players do not distort the rate distributions."""

# --- Paths -----------------------------------------------------------------
PIPELINE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_ROOT.parent
ARTIFACT_DIR = REPO_ROOT / "data" / "v1"
CACHE_DIR = PIPELINE_ROOT / ".cache" / "mirror"
"""Downloaded source files. Gitignored; safe to delete at any time."""
SCHEMA_DIR = REPO_ROOT / "schemas"
FRANCHISE_REGISTRY = PIPELINE_ROOT / "data" / "franchises.yaml"

ARTIFACT_SCHEMA_VERSION = "1.0.0"


def window_seasons() -> list[int]:
    """The season years the current build covers, oldest first."""
    start = max(EARLIEST_SEASON, LATEST_SEASON - WINDOW_LENGTH + 1)
    return list(range(start, LATEST_SEASON + 1))
