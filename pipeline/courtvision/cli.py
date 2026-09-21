"""Command line entry point.

    courtvision build                       build the configured window
    courtvision build --refresh             ignore the download cache
    courtvision build --strict              fail on unknown franchises or partial seasons
    courtvision build --skip-if-unchanged   write nothing if the data has not changed
    courtvision schemas                     regenerate schemas/*.schema.json
    courtvision schemas --check             fail if committed schemas are stale (CI)
    courtvision validate                    check published artifacts against the contract
    courtvision summary                     print a Markdown report of the published data

Exit codes: 0 success, 1 failure. A failed build never touches published data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
from pathlib import Path

from pydantic import ValidationError

from courtvision import config
from courtvision.artifacts.build import BuildFailed, build_artifacts, write_artifacts
from courtvision.artifacts.models import ARTIFACT_TYPES, json_schemas, validate_artifact
from courtvision.domain.franchise import FranchiseRegistry, UnknownFranchise
from courtvision.domain.schema import SEASON_TYPE_REGULAR
from courtvision.ingest.boxscores import FillFailed, complete_files
from courtvision.ingest.mirror import (
    MirrorSchemaChanged,
    MirrorUnavailable,
    fetch_window,
    season_published,
)
from courtvision.transform.aggregate import SuspiciousRowMix, UnknownSeasonType

log = logging.getLogger("courtvision")


def warn(message: str) -> None:
    """Log a warning, and surface it on the GitHub Actions run page when in CI."""
    log.warning(message)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        flat = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::warning title=Court Vision data::{flat}", flush=True)


BUILD_ERRORS = (
    MirrorUnavailable,
    MirrorSchemaChanged,
    SuspiciousRowMix,
    UnknownSeasonType,
    UnknownFranchise,
    FillFailed,
    BuildFailed,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="courtvision")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Fetch source data and rebuild the artifacts.")
    build.add_argument("--first", type=int, default=config.EARLIEST_SEASON)
    build.add_argument("--last", type=int, default=config.LATEST_SEASON)
    build.add_argument("--out", type=Path, default=config.ARTIFACT_DIR)
    build.add_argument("--cache", type=Path, default=config.CACHE_DIR)
    build.add_argument("--no-cache", action="store_true", help="Do not read or write the cache.")
    build.add_argument("--refresh", action="store_true", help="Re-download even if cached.")
    build.add_argument("--strict", action="store_true", help="Fail on any data warning.")
    build.add_argument("--skip-if-unchanged", action="store_true")

    schemas = sub.add_parser("schemas", help="Generate JSON Schemas from the artifact models.")
    schemas.add_argument("--out", type=Path, default=config.SCHEMA_DIR)
    schemas.add_argument("--check", action="store_true", help="Fail if files are stale.")

    validate = sub.add_parser("validate", help="Validate published artifacts.")
    validate.add_argument("--dir", type=Path, default=config.ARTIFACT_DIR)

    summary = sub.add_parser("summary", help="Markdown report of published artifacts.")
    summary.add_argument("--dir", type=Path, default=config.ARTIFACT_DIR)

    return parser


# --------------------------------------------------------------------- build --


def _build(args: argparse.Namespace) -> int:
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
        outcome = write_artifacts(result, args.out, skip_if_unchanged=args.skip_if_unchanged)
    except BUILD_ERRORS as exc:
        log.error(
            "BUILD FAILED, published artifacts left untouched.\n  %s: %s",
            type(exc).__name__,
            exc,
        )
        return 1

    for warning in result.warnings:
        warn(warning)

    # The window is explicit by design (never derived from the clock), so a new
    # season is not picked up automatically. Say so when one appears.
    if args.last == config.LATEST_SEASON and season_published(args.last + 1):
        warn(
            f"Season {args.last + 1} is now published on the mirror. Bump LATEST_SEASON "
            f"in pipeline/courtvision/config.py to include it."
        )

    manifest = result.artifacts["manifest"]
    log.info(
        "%s %d player-seasons for %d players (fingerprint %s).",
        "Built" if outcome.written else "Unchanged:",
        manifest["counts"]["player_seasons"],
        manifest["counts"]["players"],
        outcome.fingerprint[:12],
    )
    log.info("Source last published: %s", manifest["source"]["latest_published_at"])
    return 0


# ------------------------------------------------------------------- schemas --


def _render_schema(schema: dict) -> str:
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def _schemas(args: argparse.Namespace) -> int:
    rendered = {
        f"{name}.schema.json": _render_schema(schema) for name, schema in json_schemas().items()
    }

    if args.check:
        stale = []
        for filename, text in rendered.items():
            path = args.out / filename
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(filename)
        extra = (
            sorted(p.name for p in args.out.glob("*.schema.json") if p.name not in rendered)
            if args.out.exists()
            else []
        )
        if stale or extra:
            log.error(
                "Committed schemas do not match the artifact models. Stale: %s. Unexpected: %s. "
                "Run `courtvision schemas` and commit the result.",
                stale or "none",
                extra or "none",
            )
            return 1
        log.info("All %d schemas match the artifact models.", len(rendered))
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    for filename, text in rendered.items():
        (args.out / filename).write_text(text, encoding="utf-8")
    log.info("Wrote %d schemas to %s", len(rendered), args.out)
    return 0


# ------------------------------------------------------------------ validate --


def _load(directory: Path, name: str) -> object:
    return json.loads((directory / f"{name}.json").read_text(encoding="utf-8"))


def _validate(args: argparse.Namespace) -> int:
    failures = 0
    for name in ARTIFACT_TYPES:
        path = args.dir / f"{name}.json"
        if not path.exists():
            log.error("%s is missing", path)
            failures += 1
            continue
        try:
            validate_artifact(name, _load(args.dir, name))
        except (ValidationError, ValueError) as exc:
            log.error("%s violates its schema:\n%s", path.name, exc)
            failures += 1
            continue
        log.info("%s ok", path.name)

    if failures:
        return 1

    manifest = _load(args.dir, "manifest")
    for entry in (manifest.get("artifacts") or {}).values():
        actual = hashlib.sha256((args.dir / entry["path"]).read_bytes()).hexdigest()
        if actual != entry["sha256"]:
            log.error("%s does not match the hash recorded in the manifest", entry["path"])
            failures += 1
    return 1 if failures else 0


# ------------------------------------------------------------------- summary --


def render_summary(manifest: dict) -> str:
    """Markdown for a GitHub Actions job summary. Pure, so it is testable."""
    window = manifest["window"]
    lines = [
        f"## Court Vision data, {window['first']} to {window['last']}",
        "",
        f"- Source last published: `{manifest['source']['latest_published_at']}`",
        f"- Built: `{manifest['generated_at']}`",
        f"- Player-seasons: **{manifest['counts']['player_seasons']}** "
        f"across **{manifest['counts']['players']}** players",
        f"- Content fingerprint: `{(manifest.get('content_fingerprint') or '')[:12]}`",
        "",
        "| Season | Games | Covered | Coverage | Filled | Reconciled team-games |",
        "|---:|---:|---:|---:|---:|---:|",
    ]
    for season, q in manifest["quality"].items():
        lines.append(
            f"| {season} | {q['games_played']} | {q['games_covered']} | "
            f"{q['coverage']:.1%} | {q['filled_games']} | {q['team_games_reconciled']} |"
        )

    problems = []
    if manifest["partial_seasons"]:
        problems.append(f"Partial seasons: {manifest['partial_seasons']}")
    report = manifest["franchise_report"]
    if report["unknown_team_ids"]:
        problems.append(f"Unknown franchises: {report['unknown_team_ids']}")
    if report["abbreviation_drift"]:
        problems.append(f"Abbreviation drift: {report['abbreviation_drift']}")

    lines.append("")
    if problems:
        lines.append("### Needs attention")
        lines.extend(f"- {p}" for p in problems)
    else:
        lines.append("No coverage gaps, unknown franchises, or label drift.")
    return "\n".join(lines) + "\n"


def _summary(args: argparse.Namespace) -> int:
    try:
        manifest = _load(args.dir, "manifest")
    except (OSError, ValueError) as exc:
        log.error("Cannot read manifest: %s", exc)
        return 1
    sys.stdout.write(render_summary(manifest))
    return 0


# ---------------------------------------------------------------------- main --

COMMANDS = {"build": _build, "schemas": _schemas, "validate": _validate, "summary": _summary}


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
        stream=sys.stderr,
    )
    return COMMANDS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
