"""Gap filling from the mirror's player box-score release.

The 2026 game-log file stops carrying player rows after July 22 while its team
rows run to the end of the season. The mirror's separate player box-score
release does cover all 300 games of 2026, so missing games are filled from it.

The fill is only trusted because it is checked against something it did not
come from: after filling, transform/quality.reconcile compares the filled
player rows, summed per team-game, against the complete team rows from the
game-log file. If the two sources disagree, the build fails rather than
publishing a stitched-together season that does not add up.

Only the missing games are taken from box scores. Covered games are never
replaced, so a season is never silently re-sourced wholesale.

Box scores include roster rows for players who did not play (DNP, DND, NWT),
with blank minutes. Those are dropped. Keeping them would credit games played to
players who sat, and reconciliation cannot catch that, because rows of zeros add
up perfectly.
"""

from __future__ import annotations

import dataclasses
import io
import logging
from pathlib import Path

import pandas as pd
import requests

from courtvision.ingest.mirror import MirrorFile, MirrorUnavailable, _download
from courtvision.transform.quality import season_coverage

logger = logging.getLogger(__name__)

BOXSCORE_RELEASE_URL = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
    "wnba_stats_player_boxscores"
)

COLUMN_MAP: dict[str, str] = {
    "field_goals_made": "fgm",
    "field_goals_attempted": "fga",
    "three_pointers_made": "fg3m",
    "three_pointers_attempted": "fg3a",
    "free_throws_made": "ftm",
    "free_throws_attempted": "fta",
    "rebounds_offensive": "oreb",
    "rebounds_defensive": "dreb",
    "rebounds_total": "reb",
    "assists": "ast",
    "steals": "stl",
    "blocks": "blk",
    "turnovers": "tov",
    "points": "pts",
}


class FillFailed(ValueError):
    """Box-score rows could not be attached to known games and teams."""


def boxscore_url(season: int) -> str:
    return f"{BOXSCORE_RELEASE_URL}/player_boxscores_{season}.parquet"


def fetch_boxscores(
    season: int,
    cache_dir: Path | None = None,
    refresh: bool = False,
    session: requests.Session | None = None,
) -> pd.DataFrame | None:
    """Return the season's box scores, or None if the mirror has none for it."""
    cache_path = cache_dir / f"player_boxscores_{season}.parquet" if cache_dir else None
    if cache_path and cache_path.exists() and not refresh:
        return pd.read_parquet(cache_path)
    try:
        response = _download(boxscore_url(season), session or requests.Session())
    except MirrorUnavailable as exc:
        if "404" in str(exc):
            logger.info("No box-score release for %s; gaps cannot be filled.", season)
            return None
        raise
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(response.content)
    return pd.read_parquet(io.BytesIO(response.content))


def parse_minutes(value: object) -> float | None:
    """'28:29' -> 28.4833. Blank means the player did not appear."""
    text = "" if value is None else str(value).strip()
    if not text or text.lower() == "nan":
        return None
    if ":" in text:
        minutes, seconds = text.split(":", 1)
        return int(minutes) + int(seconds) / 60
    return float(text)


def boxscores_to_game_logs(
    box: pd.DataFrame, raw_logs: pd.DataFrame, game_ids: list[str]
) -> pd.DataFrame:
    """Convert box-score rows for `game_ids` into game-log shaped player rows.

    Game date, season type and the team's abbreviation come from the game-log
    file's team rows for the same game, so filled rows carry exactly the same
    labels as the rows around them.
    """
    subset = box[box["game_id"].astype(str).isin(set(game_ids))].copy()
    subset["min"] = subset["minutes"].map(parse_minutes)
    subset = subset[subset["min"].notna()]

    out = pd.DataFrame(
        {
            "game_id": subset["game_id"].astype(str),
            "team_id": subset["team_id"].astype("int64"),
            "player_id": subset["person_id"].astype("int64"),
            "player_name": (
                subset["first_name"].fillna("").str.strip()
                + " "
                + subset["family_name"].fillna("").str.strip()
            ).str.strip(),
            "min": subset["min"].astype(float),
            **{target: subset[source].astype(float) for source, target in COLUMN_MAP.items()},
        }
    )

    team_rows = raw_logs[raw_logs["player_id"].isna()]
    meta = team_rows[
        ["game_id", "team_id", "team_abbreviation", "game_date", "season_type", "season"]
    ].drop_duplicates(["game_id", "team_id"])
    meta = meta.assign(game_id=meta["game_id"].astype(str), team_id=meta["team_id"].astype("int64"))
    out = out.merge(meta, on=["game_id", "team_id"], how="left")

    orphaned = out[out["season"].isna()]
    if not orphaned.empty:
        raise FillFailed(
            f"{len(orphaned)} box-score rows reference game/team pairs with no team "
            f"row in the game-log file (e.g. game {orphaned['game_id'].iloc[0]}). "
            f"The two releases disagree about which games exist."
        )

    # Prefer the game-log spelling of a player's name where one exists, so the
    # same person is never rendered two ways.
    known = raw_logs.dropna(subset=["player_id"]).drop_duplicates("player_id", keep="last")
    names = dict(zip(known["player_id"].astype("int64"), known["player_name"], strict=False))
    out["player_name"] = [
        names.get(pid, name)
        for pid, name in zip(out["player_id"], out["player_name"], strict=False)
    ]
    return out


def fill_gaps(
    raw_logs: pd.DataFrame, box: pd.DataFrame, missing_game_ids: list[str]
) -> pd.DataFrame:
    """Append filled player rows for the missing games only."""
    if not missing_game_ids:
        return raw_logs
    filled = boxscores_to_game_logs(box, raw_logs, missing_game_ids)
    covered = set(filled["game_id"])
    still_missing = set(missing_game_ids) - covered
    if still_missing:
        logger.warning("%d games remain unfilled after box-score fill.", len(still_missing))
    logger.info("Filled %d player rows across %d games from box scores.", len(filled), len(covered))
    return pd.concat([raw_logs, filled], ignore_index=True)


def complete_files(
    files: list[MirrorFile],
    season_type: str,
    cache_dir: Path | None = None,
    refresh: bool = False,
) -> list[MirrorFile]:
    """Fill player-level gaps in any season that has them, where possible.

    Seasons that are already complete pass through untouched. A season whose
    gaps cannot be filled passes through as-is; the build then records it as
    partial rather than pretending it is whole.
    """
    completed = []
    session = requests.Session()
    for mirror_file in files:
        coverage = season_coverage(mirror_file.frame, mirror_file.season, season_type)
        if coverage.complete:
            completed.append(mirror_file)
            continue

        logger.warning(
            "Season %s: player rows cover %d of %d games (last %s). Attempting fill.",
            mirror_file.season,
            coverage.games_covered,
            coverage.games_played,
            coverage.last_covered_date,
        )
        box = fetch_boxscores(
            mirror_file.season, cache_dir=cache_dir, refresh=refresh, session=session
        )
        if box is None:
            completed.append(mirror_file)
            continue

        filled = fill_gaps(mirror_file.frame, box, coverage.missing_game_ids)
        added_games = len(coverage.missing_game_ids) - len(
            season_coverage(filled, mirror_file.season, season_type).missing_game_ids
        )
        completed.append(
            dataclasses.replace(
                mirror_file,
                frame=filled,
                filled_games=added_games,
                fill_source=boxscore_url(mirror_file.season),
            )
        )
    return completed
