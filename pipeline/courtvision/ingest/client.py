"""The only module that talks to the network.

Two lessons from development are encoded here rather than rediscovered.

First, this endpoint HANGS rather than erroring when it is unhappy. During the
notebook work, direct requests without a timeout sat there indefinitely. So the
timeout is mandatory, not optional, and it is passed explicitly on every call.

Second, the source actively resists non-browser traffic. nba_api handles the
header spoofing internally, which is the reason to use it rather than requests,
but it can still be refused or throttled. Retries use exponential backoff and
give up loudly rather than silently returning a partial result.

A partial refresh is worse than no refresh, because the site would publish an
artifact missing seasons and look fine doing it. So failure here propagates.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats

from courtvision import config
from courtvision.domain.seasons import season_string

logger = logging.getLogger(__name__)


class StatsUnavailable(RuntimeError):
    """The stats API could not be reached or refused the request.

    Raised after retries are exhausted. Callers must treat this as fatal to the
    build rather than skipping the season, so a partial artifact is never
    published.
    """


@dataclass(frozen=True)
class SeasonPull:
    """One season's raw response, with the provenance needed to debug it later."""

    season_year: int
    season_string: str
    season_type: str
    frame: pd.DataFrame
    attempts: int
    elapsed_seconds: float


def _backoff_delay(attempt: int) -> float:
    """Exponential backoff with jitter, capped.

    Jitter matters because the refresh pulls seasons in a loop: without it,
    every retry lines up and hits the endpoint in the same rhythm that got the
    request throttled in the first place.
    """
    raw = config.BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
    capped = min(raw, config.BACKOFF_MAX_SECONDS)
    return capped * (0.5 + random.random() / 2)


def fetch_season(
    season_year: int,
    season_type: str = config.SEASON_TYPE_REGULAR,
) -> SeasonPull:
    """Pull one WNBA season of player stats.

    Raises:
        StatsUnavailable: if every attempt fails.
    """
    season_str = season_string(season_year)
    started = time.monotonic()
    last_error: Exception | None = None

    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            logger.info(
                "Fetching season %s (%s), attempt %d/%d",
                season_year,
                season_str,
                attempt,
                config.MAX_RETRIES,
            )
            endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
                league_id_nullable=config.WNBA_LEAGUE_ID,
                season=season_str,
                season_type_all_star=season_type,
                per_mode_detailed=config.PER_MODE,
                timeout=config.REQUEST_TIMEOUT_SECONDS,
            )
            frames = endpoint.get_data_frames()
            if not frames:
                raise StatsUnavailable(
                    f"Season {season_year} returned no result sets at all."
                )

            frame = frames[0]
            if frame.empty:
                raise StatsUnavailable(
                    f"Season {season_year} ({season_str}) returned zero rows. "
                    "Either the season does not exist or the request was refused. "
                    "Check the season window in config before assuming a bug."
                )

            elapsed = time.monotonic() - started
            logger.info(
                "Season %s returned %d rows in %.1fs", season_year, len(frame), elapsed
            )
            return SeasonPull(
                season_year=season_year,
                season_string=season_str,
                season_type=season_type,
                frame=frame,
                attempts=attempt,
                elapsed_seconds=elapsed,
            )

        except StatsUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001 - upstream raises a wide variety
            last_error = exc
            if attempt == config.MAX_RETRIES:
                break
            delay = _backoff_delay(attempt)
            logger.warning(
                "Season %s attempt %d failed (%s: %s). Retrying in %.1fs",
                season_year,
                attempt,
                type(exc).__name__,
                exc,
                delay,
            )
            time.sleep(delay)

    raise StatsUnavailable(
        f"Season {season_year} ({season_str}) failed after {config.MAX_RETRIES} "
        f"attempts. Last error: {type(last_error).__name__}: {last_error}"
    ) from last_error


def fetch_window(
    season_years: list[int],
    season_type: str = config.SEASON_TYPE_REGULAR,
) -> list[SeasonPull]:
    """Pull every season in the window, pacing requests between them.

    Fails the whole build if any single season fails, by design. See the module
    docstring: a partial artifact that looks complete is the worse outcome.
    """
    pulls: list[SeasonPull] = []
    for index, year in enumerate(season_years):
        if index > 0:
            time.sleep(config.PAUSE_BETWEEN_SEASONS_SECONDS)
        pulls.append(fetch_season(year, season_type=season_type))
    return pulls
