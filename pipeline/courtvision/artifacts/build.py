"""Build the static JSON artifacts the frontend renders.

THE CONTRACT
------------
The frontend never computes a metric. Every number it shows is produced here,
by the tested Python in metrics/, and written out as finished answers. That is
what keeps one formula in one place instead of a Python copy and a JavaScript
copy drifting apart.

    manifest.json        provenance, methodology, window, franchise report
    league-trends.json   one row per season, league-level, confounds attached
    player-seasons.json  one row per player per season, totals and rates
    careers.json         one row per player, games-weighted over the window
    franchises.json      franchise registry, eras and identities, for labeling

ALL OR NOTHING
--------------
Every artifact is built in memory before anything touches disk. Only a complete,
validated build is written, and it is written to a staging directory that then
replaces the published one. If any season fails to download, parse, validate or
aggregate, the previous artifacts are left untouched and the site keeps serving
them with their honest timestamp.

A half-refreshed data directory is worse than a stale one, because it looks
complete.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from courtvision import config
from courtvision.domain.franchise import FranchiseRegistry
from courtvision.domain.schema import SEASON_TYPE_REGULAR, PlayerSeason
from courtvision.domain.seasons import SEASON_MAPPING_VERIFIED
from courtvision.ingest.mirror import MIRROR_HOMEPAGE, MIRROR_NAME, MirrorFile
from courtvision.metrics.career import career_totals
from courtvision.metrics.league import league_trends
from courtvision.metrics.rates import (
    FREE_THROW_ATTEMPT_COEFFICIENT,
    MINUTES_NORMALIZATION_BASE,
)
from courtvision.transform.aggregate import (
    aggregate_normalized,
    normalize_game_logs,
    normalize_season_type,
)
from courtvision.transform.quality import reconcile, season_coverage

logger = logging.getLogger(__name__)

FLOAT_PRECISION = 4

PLAYER_SEASON_FIELDS: tuple[str, ...] = (
    "season",
    "player_id",
    "player_name",
    "team_id",
    "team_abbreviation",
    "franchise_slug",
    "is_multi_team",
    "teams",
    "gp",
    "min",
    "pts",
    "reb",
    "oreb",
    "dreb",
    "ast",
    "stl",
    "blk",
    "tov",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "fg_pct",
    "fg3_pct",
    "ft_pct",
    "ts_pct",
    "efg_pct",
    "fg3a_rate",
    "ftr",
    "ast_to",
    "min_pg",
    "pts_pg",
    "reb_pg",
    "ast_pg",
    "stl_pg",
    "blk_pg",
    "tov_pg",
    "pts_per36",
    "reb_per36",
    "ast_per36",
    "stl_per36",
    "blk_per36",
    "tov_per36",
)

CAREER_FIELDS: tuple[str, ...] = (
    "player_id",
    "player_name",
    "first_season",
    "last_season",
    "seasons_played",
    "gp",
    "min",
    "pts",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "fg_pct",
    "fg3_pct",
    "ft_pct",
    "ts_pct",
    "efg_pct",
    "fg3a_rate",
    "ftr",
    "ast_to",
    "min_pg",
    "pts_pg",
    "reb_pg",
    "ast_pg",
    "stl_pg",
    "blk_pg",
    "tov_pg",
    "pts_per36",
    "reb_per36",
    "ast_per36",
)


class BuildFailed(RuntimeError):
    """Raised when the build cannot produce a complete, valid artifact set."""


@dataclass
class BuildResult:
    artifacts: dict[str, object]
    warnings: list[str] = field(default_factory=list)


def _clean(value):
    """JSON-safe scalar: NaN and inf become null, floats are rounded."""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, FLOAT_PRECISION)
    if hasattr(value, "item"):  # numpy scalar
        return _clean(value.item())
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _records(frame: pd.DataFrame, fields: tuple[str, ...]) -> list[dict]:
    missing = [f for f in fields if f not in frame.columns]
    if missing:
        raise BuildFailed(f"Expected columns missing from build frame: {missing}")
    return [
        {key: _clean(value) for key, value in row.items()}
        for row in frame[list(fields)].to_dict(orient="records")
    ]


def _validate_rows(frame: pd.DataFrame) -> None:
    """Run every player-season through the schema. One bad row fails the build."""
    for row in frame.to_dict(orient="records"):
        try:
            PlayerSeason(
                season=row["season"],
                season_type=row["season_type"],
                player_id=row["player_id"],
                player_name=row["player_name"],
                team_id=row["team_id"],
                team_abbreviation=row["team_abbreviation"],
                gp=row["gp"],
                is_multi_team=bool(row["is_multi_team"]),
                **{
                    k: row[k]
                    for k in (
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
                    )
                },
            )
        except Exception as exc:  # noqa: BLE001
            raise BuildFailed(
                f"Player-season failed validation: player_id={row.get('player_id')} "
                f"season={row.get('season')}: {exc}"
            ) from exc


def build_artifacts(
    files: list[MirrorFile],
    registry: FranchiseRegistry,
    now: datetime | None = None,
    strict: bool = False,
) -> BuildResult:
    """Produce every artifact in memory. Writes nothing."""
    if not files:
        raise BuildFailed("No source files supplied.")

    seasons = sorted(f.season for f in files)
    expected = list(range(seasons[0], seasons[-1] + 1))
    if seasons != expected:
        raise BuildFailed(
            f"Season window has gaps: got {seasons}, expected {expected}. "
            f"Refusing to publish a window with missing years."
        )

    season_frames: list[pd.DataFrame] = []
    trend_inputs: dict[int, tuple[pd.DataFrame, pd.DataFrame]] = {}
    quality: dict[str, dict] = {}
    partial: list[int] = []
    warnings: list[str] = []

    for mirror_file in sorted(files, key=lambda f: f.season):
        raw = mirror_file.frame

        # Gate 1: player rows must add up to team rows, game by game.
        recon = reconcile(raw, SEASON_TYPE_REGULAR)
        if not recon.clean:
            sample = recon.mismatches[:3]
            raise BuildFailed(
                f"Season {mirror_file.season}: {len(recon.mismatches)} player/team "
                f"reconciliation mismatches, e.g. {sample}. Refusing to publish "
                f"numbers that do not add up."
            )

        # Gate 2: every game that was played must have player rows.
        coverage = season_coverage(raw, mirror_file.season, SEASON_TYPE_REGULAR)
        if not coverage.complete:
            partial.append(mirror_file.season)
            message = (
                f"Season {mirror_file.season} is PARTIAL: player data covers "
                f"{coverage.games_covered} of {coverage.games_played} games, through "
                f"{coverage.last_covered_date} (season ran to {coverage.last_played_date})."
            )
            if strict:
                raise BuildFailed(message)
            warnings.append(message)

        quality[str(mirror_file.season)] = {
            **coverage.as_dict(),
            "team_games_reconciled": recon.team_games_compared,
            "filled_games": mirror_file.filled_games,
            "fill_source": mirror_file.fill_source,
        }

        normalized = normalize_game_logs(raw)
        season_frames.append(aggregate_normalized(normalized, season_type=SEASON_TYPE_REGULAR))

        kinds = raw["season_type"].map(normalize_season_type)
        team_rows = raw[raw["player_id"].isna() & (kinds == SEASON_TYPE_REGULAR)]
        player_rows = normalized[normalized["season_type"] == SEASON_TYPE_REGULAR]
        trend_inputs[mirror_file.season] = (team_rows, player_rows)

    player_seasons = pd.concat(season_frames, ignore_index=True)
    _validate_rows(player_seasons)

    # Resolve every row through the franchise registry. This is what turns
    # PHO/PHX into one franchise and keeps Portland's two eras apart, and it
    # fills the registry's report with anything unknown or drifting.
    labels, slugs = [], []
    for row in player_seasons.itertuples(index=False):
        franchise = registry.resolve(int(row.team_id), int(row.season), str(row.team_abbreviation))
        labels.append(
            registry.label_for(int(row.team_id), int(row.season), str(row.team_abbreviation))
        )
        slugs.append(franchise.slug)
    player_seasons["team_abbreviation"] = labels
    player_seasons["franchise_slug"] = slugs

    careers = career_totals(player_seasons)
    trends = league_trends(trend_inputs)

    report = registry.report
    if not report.is_clean():
        warnings.extend(report.summary().splitlines())

    generated_at = (now or datetime.now(UTC)).replace(microsecond=0).isoformat()
    provenance = [f.provenance() for f in sorted(files, key=lambda f: f.season)]
    published = [p["last_modified"] for p in provenance if p["last_modified"]]

    manifest = {
        "schema_version": config.ARTIFACT_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source": {
            "name": MIRROR_NAME,
            "homepage": MIRROR_HOMEPAGE,
            "latest_published_at": max(published) if published else None,
            "files": provenance,
        },
        "window": {"first": seasons[0], "last": seasons[-1], "seasons": seasons},
        "season_type": SEASON_TYPE_REGULAR,
        "methodology": {
            "true_shooting_ft_coefficient": FREE_THROW_ATTEMPT_COEFFICIENT,
            "per_minutes_base": MINUTES_NORMALIZATION_BASE,
            "season_labels_verified": SEASON_MAPPING_VERIFIED,
            "league_averages": "ratio of league totals per team-game",
            "careers": "games-weighted totals within the window only",
        },
        "confounded_seasons": {
            str(k): v for k, v in config.CONFOUNDED_SEASONS.items() if k in seasons
        },
        "label_changes": {
            str(k): v for k, v in config.LABEL_CHANGES_IN_WINDOW.items() if k in seasons
        },
        "franchise_report": {
            "clean": report.is_clean(),
            "unknown_team_ids": {str(k): v for k, v in report.unknown_team_ids.items()},
            "abbreviation_drift": [
                {"team_id": t, "season": s, "registry": r, "observed": o}
                for t, s, r, o in report.abbreviation_drift
            ],
        },
        "quality": quality,
        "partial_seasons": partial,
        "counts": {
            "player_seasons": int(len(player_seasons)),
            "players": int(player_seasons["player_id"].nunique()),
            "per_season": {
                str(int(s)): int(n) for s, n in player_seasons.groupby("season").size().items()
            },
        },
    }

    franchises = [
        {
            "team_id": f.team_id,
            "slug": f.slug,
            "eras": [
                [
                    {
                        "abbreviation": i.abbreviation,
                        "name": i.name,
                        "city": i.city,
                        "first_season": i.first_season,
                        "last_season": i.last_season,
                        "verified": i.verified,
                    }
                    for i in era
                ]
                for era in f.eras()
            ],
        }
        for f in registry.all_franchises()
    ]

    artifacts = {
        "manifest": manifest,
        "league-trends": _records(trends, tuple(trends.columns)),
        "player-seasons": _records(player_seasons, PLAYER_SEASON_FIELDS),
        "careers": _records(careers, CAREER_FIELDS),
        "franchises": franchises,
    }

    # Final guard: every artifact must serialize without NaN or Infinity.
    for name, payload in artifacts.items():
        try:
            json.dumps(payload, allow_nan=False)
        except ValueError as exc:
            raise BuildFailed(f"Artifact {name!r} contains a non-finite number: {exc}") from exc

    return BuildResult(artifacts=artifacts, warnings=warnings)


def _serialize(payload: object) -> bytes:
    return json.dumps(payload, allow_nan=False, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def write_artifacts(result: BuildResult, out_dir: Path) -> dict[str, dict]:
    """Write atomically: stage everything, then swap the directory in."""
    out_dir = Path(out_dir)
    staging = out_dir.with_name(out_dir.name + ".staging")
    previous = out_dir.with_name(out_dir.name + ".previous")

    for path in (staging, previous):
        if path.exists():
            shutil.rmtree(path)
    staging.mkdir(parents=True)

    index: dict[str, dict] = {}
    for name, payload in result.artifacts.items():
        if name == "manifest":
            continue
        data = _serialize(payload)
        (staging / f"{name}.json").write_bytes(data)
        index[name] = {
            "path": f"{name}.json",
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    manifest = dict(result.artifacts["manifest"])
    manifest["artifacts"] = index
    (staging / "manifest.json").write_bytes(_serialize(manifest))

    if out_dir.exists():
        out_dir.rename(previous)
    staging.rename(out_dir)
    if previous.exists():
        shutil.rmtree(previous)

    logger.info("Wrote %d artifacts to %s", len(index) + 1, out_dir)
    return index
