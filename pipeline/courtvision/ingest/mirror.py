"""Primary data source: the sportsdataverse WNBA game-log mirror.

WHY THIS SOURCE
---------------
stats.nba.com blackholes datacenter traffic. Spike 03 proved a GitHub Actions
runner cannot reach it: the TCP connection opens and the server never answers.
Every cloud scheduler is a datacenter, so no hosted refresh can call the API
directly.

The sportsdataverse project republishes WNBA game logs as Parquet in GitHub
releases, which every runner can reach, and covers every season from 1997.
Court Vision aggregates those logs itself (see transform/aggregate.py), which
also gives it control over how seasons and careers are computed.

nba_api (ingest/client.py) remains as a local-only cross-check. Depending on a
volunteer-run mirror is a real risk, and keeping a second path is the mitigation.

PROVENANCE
----------
Every download records the asset's Last-Modified and ETag headers. Those flow
into the artifact manifest, so the site can say when its source data was
published, not merely when the build ran. The two differ, and a reader deserves
to know which one "last updated" means.
"""

from __future__ import annotations

import hashlib
import io
import logging
import random
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd
import requests

from courtvision import config

logger = logging.getLogger(__name__)

MIRROR_NAME = "sportsdataverse wehoop WNBA stats mirror"
MIRROR_RELEASE_URL = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
    "wnba_stats_player_game_logs"
)
MIRROR_HOMEPAGE = "https://github.com/sportsdataverse/wehoop-wnba-stats-data"

REQUIRED_COLUMNS: frozenset[str] = frozenset(
    {
        "season",
        "season_type",
        "game_id",
        "game_date",
        "player_id",
        "player_name",
        "team_id",
        "team_abbreviation",
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
    }
)


class MirrorUnavailable(RuntimeError):
    """The mirror could not be reached, or returned something unusable.

    Fatal to the build. A partial set of seasons must never be published as if
    it were complete; the site keeps serving the last good artifacts instead.
    """


class MirrorSchemaChanged(RuntimeError):
    """The file downloaded fine but no longer has the columns we depend on."""


@dataclass(frozen=True)
class MirrorFile:
    season: int
    url: str
    frame: pd.DataFrame
    last_modified: str | None
    etag: str | None
    sha256: str
    from_cache: bool
    filled_games: int = 0
    fill_source: str | None = None

    def provenance(self) -> dict:
        return {
            "season": self.season,
            "url": self.url,
            "last_modified": self.last_modified,
            "etag": self.etag,
            "sha256": self.sha256,
            "rows": int(len(self.frame)),
            "filled_games": self.filled_games,
            "fill_source": self.fill_source,
        }


def season_url(season: int) -> str:
    return f"{MIRROR_RELEASE_URL}/player_game_logs_{season}.parquet"


def _iso(http_date: str | None) -> str | None:
    if not http_date:
        return None
    try:
        return parsedate_to_datetime(http_date).isoformat()
    except (TypeError, ValueError):
        return http_date


def _backoff(attempt: int) -> float:
    raw = config.BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
    return min(raw, config.BACKOFF_MAX_SECONDS) * (0.5 + random.random() / 2)


def _download(url: str, session: requests.Session) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            response = session.get(url, timeout=config.REQUEST_TIMEOUT_SECONDS)
            if response.status_code == 404:
                raise MirrorUnavailable(
                    f"{url} returned 404. The season may not be published yet, or "
                    f"the mirror's file naming changed."
                )
            response.raise_for_status()
            if not response.content:
                raise MirrorUnavailable(f"{url} returned an empty body.")
            return response
        except MirrorUnavailable:
            raise
        except requests.RequestException as exc:
            last_error = exc
            if attempt == config.MAX_RETRIES:
                break
            delay = _backoff(attempt)
            logger.warning(
                "Download attempt %d failed (%s); retrying in %.1fs", attempt, exc, delay
            )
            time.sleep(delay)
    raise MirrorUnavailable(
        f"{url} failed after {config.MAX_RETRIES} attempts: {last_error}"
    ) from last_error


def validate_frame(frame: pd.DataFrame, season: int) -> None:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise MirrorSchemaChanged(
            f"Season {season} is missing required columns {sorted(missing)}. The "
            f"mirror's schema has changed; the adapter needs updating before any "
            f"artifact is rebuilt."
        )
    if frame.empty:
        raise MirrorUnavailable(f"Season {season} parsed to zero rows.")

    seasons_present = set(pd.to_numeric(frame["season"], errors="coerce").dropna().astype(int))
    if seasons_present != {season}:
        raise MirrorSchemaChanged(
            f"File for season {season} contains seasons {sorted(seasons_present)}. "
            f"Refusing to guess which rows belong where."
        )


def fetch_season(
    season: int,
    cache_dir: Path | None = None,
    refresh: bool = False,
    session: requests.Session | None = None,
) -> MirrorFile:
    """Download (or load from cache) one season of game logs and validate it."""
    url = season_url(season)
    cache_path = cache_dir / f"player_game_logs_{season}.parquet" if cache_dir else None
    meta_path = cache_path.with_suffix(".meta") if cache_path else None

    if cache_path and cache_path.exists() and not refresh:
        payload = cache_path.read_bytes()
        last_modified, etag = None, None
        if meta_path and meta_path.exists():
            lines = meta_path.read_text(encoding="utf-8").splitlines() + ["", ""]
            last_modified, etag = lines[0] or None, lines[1] or None
        from_cache = True
    else:
        response = _download(url, session or requests.Session())
        payload = response.content
        last_modified = _iso(response.headers.get("Last-Modified"))
        etag = response.headers.get("ETag")
        from_cache = False
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(payload)
            meta_path.write_text(f"{last_modified or ''}\n{etag or ''}\n", encoding="utf-8")

    try:
        frame = pd.read_parquet(io.BytesIO(payload))
    except Exception as exc:  # noqa: BLE001 - any parse failure means an unusable file
        raise MirrorUnavailable(f"Season {season} could not be parsed as Parquet: {exc}") from exc

    validate_frame(frame, season)

    return MirrorFile(
        season=season,
        url=url,
        frame=frame,
        last_modified=last_modified,
        etag=etag,
        sha256=hashlib.sha256(payload).hexdigest(),
        from_cache=from_cache,
    )


def fetch_window(
    seasons: list[int],
    cache_dir: Path | None = None,
    refresh: bool = False,
) -> list[MirrorFile]:
    """Fetch every season or fail the whole build. No partial windows."""
    session = requests.Session()
    files = []
    for season in seasons:
        mirror_file = fetch_season(season, cache_dir=cache_dir, refresh=refresh, session=session)
        logger.info(
            "Season %s: %d rows (%s)",
            season,
            len(mirror_file.frame),
            "cache" if mirror_file.from_cache else "downloaded",
        )
        files.append(mirror_file)
    return files
