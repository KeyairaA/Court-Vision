"""Command line entry point.

    courtvision build                 # the configured window, cached downloads
    courtvision build --refresh       # ignore the cache and re-download
    courtvision build --strict        # fail on any unknown franchise (use in CI)
    courtvision build --first 2020 --last 2026

Exit codes: 0 on success, 1 on a failed build. A failed build never touches the
published artifacts.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from courtvision import config
from courtvision.artifacts.build import BuildFailed, build_artifacts, write_artifacts
from courtvision.domain.franchise import FranchiseRegistry, UnknownFranchise
from courtvision.domain.schema import SEASON_TYPE_REGULAR
from courtvision.ingest.boxscores import FillFailed, complete_files
from courtvision.ingest.mirror import MirrorSchemaChanged, MirrorUnavailable, fetch_window
from courtvision.transform.aggregate import SuspiciousRowMix, UnknownSeasonType


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="courtvision")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Fetch source data and rebuild the artifacts.")
    build.add_argument("--first", type=int, default=config.EARLIEST_SEASON)
    build.add_argument("--last", type=int, default=config.LATEST_SEASON)
    build.add_argument("--out", type=Path, default=config.ARTIFACT_DIR)
    build.add_argument("--cache", type=Path, default=config.CACHE_DIR)
    build.add_argument("--no-cache", action="store_true", help="Do not read or write the cache.")
    build.add_argument("--refresh", action="store_true", help="Re-download even if cached.")
    build.add_argument("--strict", action="store_true", help="Fail on unknown franchises.")
    build.add_argument("-v", "--verbose", action="store_true")
    return parser


def _build(args: argparse.Namespace) -> int:
    log = logging.getLogger("courtvision")
    if args.last < args.first:
        log.error("--last (%s) is before --first (%s)", args.last, args.first)
        return 1

    seasons = list(range(args.first, args.last + 1))
    cache = None if args.no_cache else args.cache
    log.info("Building seasons %s-%s (%d seasons)", args.first, args.last, len(seasons))

    try:
        files = fetch_window(seasons, cache_dir=cache, refresh=args.refresh)
        files = complete_files(files, SEASON_TYPE_REGULAR, cache_dir=cache, refresh=args.refresh)
        registry = FranchiseRegistry.load(strict=args.strict)
        result = build_artifacts(files, registry, strict=args.strict)
        index = write_artifacts(result, args.out)
    except (
        MirrorUnavailable,
        MirrorSchemaChanged,
        SuspiciousRowMix,
        UnknownSeasonType,
        UnknownFranchise,
        FillFailed,
        BuildFailed,
    ) as exc:
        log.error(
            "BUILD FAILED, published artifacts left untouched.\n  %s: %s", type(exc).__name__, exc
        )
        return 1

    for warning in result.warnings:
        log.warning(warning)

    manifest = result.artifacts["manifest"]
    total = sum(entry["bytes"] for entry in index.values())
    log.info(
        "Built %d player-seasons for %d players; %d artifact bytes.",
        manifest["counts"]["player_seasons"],
        manifest["counts"]["players"],
        total,
    )
    log.info("Source last published: %s", manifest["source"]["latest_published_at"])
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    if args.command == "build":
        return _build(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
