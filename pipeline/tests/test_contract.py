"""Tests for the artifact contract, fingerprinting, and the CLI commands built on them."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from courtvision import config
from courtvision.artifacts.build import build_artifacts, write_artifacts
from courtvision.artifacts.models import json_schemas, validate_artifact
from courtvision.cli import main, render_summary
from courtvision.domain.franchise import FranchiseRegistry
from tests.conftest import make_season
from tests.test_build import as_file, two_seasons

NOW = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)


@pytest.fixture
def built():
    return build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW)


class TestSchemas:
    def test_committed_schemas_match_the_models(self):
        """The same check CI runs. A model change without regenerating fails here."""
        assert main(["schemas", "--check"]) == 0

    def test_field_titles_are_stripped(self):
        """Left in, they became colliding TypeScript aliases, one of which
        silently turned the PlayerSeasons artifact type into `number`."""
        schema = json_schemas()["player-seasons"]
        record = schema["$defs"]["PlayerSeasonRecord"]
        assert "title" in record
        assert all("title" not in spec for spec in record["properties"].values())

    def test_every_schema_forbids_extra_fields(self):
        for name, schema in json_schemas().items():
            for model_name, model in schema.get("$defs", {}).items():
                assert model.get("additionalProperties") is False, f"{name}:{model_name}"


class TestValidation:
    def test_real_shaped_build_passes(self, built):
        for name, payload in built.artifacts.items():
            validate_artifact(name, payload)

    def test_an_extra_field_is_rejected(self, built):
        rows = [dict(built.artifacts["player-seasons"][0], surprise=1)]
        with pytest.raises(ValidationError, match="surprise"):
            validate_artifact("player-seasons", rows)

    def test_a_missing_field_is_rejected(self, built):
        row = dict(built.artifacts["player-seasons"][0])
        del row["franchise_slug"]
        with pytest.raises(ValidationError, match="franchise_slug"):
            validate_artifact("player-seasons", [row])

    def test_null_rates_are_allowed_null_counts_are_not(self, built):
        row = dict(built.artifacts["player-seasons"][0])
        validate_artifact("player-seasons", [dict(row, fg3_pct=None)])
        with pytest.raises(ValidationError):
            validate_artifact("player-seasons", [dict(row, pts=None)])

    def test_published_data_satisfies_the_contract(self):
        """Whatever is committed in data/v1 must validate, hashes included."""
        if not (config.ARTIFACT_DIR / "manifest.json").exists():
            pytest.skip("No published artifacts in this checkout.")
        assert main(["validate", "--dir", str(config.ARTIFACT_DIR)]) == 0


class TestFingerprint:
    def test_rebuilding_identical_data_writes_nothing(self, tmp_path):
        out = tmp_path / "v1"
        first = write_artifacts(
            build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW), out
        )
        later = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
        second = write_artifacts(
            build_artifacts(two_seasons(), FranchiseRegistry.load(), now=later),
            out,
            skip_if_unchanged=True,
        )
        assert first.written and not second.written
        assert first.fingerprint == second.fingerprint
        manifest = json.loads((out / "manifest.json").read_text())
        assert manifest["generated_at"] == "2026-09-21T12:00:00+00:00"

    def test_changed_data_changes_the_fingerprint(self, tmp_path):
        out = tmp_path / "v1"
        write_artifacts(build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW), out)
        changed = [as_file(make_season(season=2025), 2025), as_file(make_season(games=5), 2026)]
        outcome = write_artifacts(
            build_artifacts(changed, FranchiseRegistry.load(), now=NOW),
            out,
            skip_if_unchanged=True,
        )
        assert outcome.written

    def test_fingerprint_is_recorded_in_the_manifest(self, tmp_path):
        out = tmp_path / "v1"
        outcome = write_artifacts(
            build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW), out
        )
        manifest = json.loads((out / "manifest.json").read_text())
        assert manifest["content_fingerprint"] == outcome.fingerprint


class TestValidateCommand:
    def test_detects_a_file_edited_after_publishing(self, tmp_path, built):
        out = tmp_path / "v1"
        write_artifacts(built, out)
        assert main(["validate", "--dir", str(out)]) == 0
        path = out / "careers.json"
        path.write_bytes(path.read_bytes().replace(b'"gp":', b'"gp": ', 1))
        assert main(["validate", "--dir", str(out)]) == 1

    def test_detects_a_missing_file(self, tmp_path, built):
        out = tmp_path / "v1"
        write_artifacts(built, out)
        (out / "franchises.json").unlink()
        assert main(["validate", "--dir", str(out)]) == 1


class TestSummary:
    def test_clean_build(self, tmp_path, built):
        out = tmp_path / "v1"
        write_artifacts(built, out)
        text = render_summary(json.loads((out / "manifest.json").read_text()))
        assert "| 2026 |" in text
        assert "No coverage gaps" in text

    def test_partial_season_is_called_out(self):
        partial = as_file(make_season(games=10, drop_player_rows_after=6), 2026)
        manifest = build_artifacts([partial], FranchiseRegistry.load(), now=NOW).artifacts[
            "manifest"
        ]
        text = render_summary(manifest)
        assert "Needs attention" in text
        assert "Partial seasons: [2026]" in text


class TestWarnings:
    def test_warnings_become_github_annotations_in_ci(self, monkeypatch, capsys):
        from courtvision.cli import warn

        monkeypatch.setenv("GITHUB_ACTIONS", "true")
        warn("Season 2026 is PARTIAL:\nsecond line")
        out = capsys.readouterr().out
        assert out.startswith("::warning title=Court Vision data::")
        assert "%0A" in out and "\n" not in out.rstrip("\n")

    def test_no_annotations_outside_ci(self, monkeypatch, capsys):
        from courtvision.cli import warn

        monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
        warn("quiet")
        assert capsys.readouterr().out == ""


class TestSeasonPublished:
    class _Session:
        def __init__(self, status=None, error=None):
            self.status, self.error = status, error

        def head(self, url, timeout, allow_redirects):
            if self.error:
                raise self.error
            return type("R", (), {"status_code": self.status})()

    def test_published(self):
        from courtvision.ingest.mirror import season_published

        assert season_published(2027, session=self._Session(status=200))

    def test_not_published(self):
        from courtvision.ingest.mirror import season_published

        assert not season_published(2027, session=self._Session(status=404))

    def test_network_failure_is_not_fatal(self):
        import requests

        from courtvision.ingest.mirror import season_published

        assert not season_published(2027, session=self._Session(error=requests.ConnectionError()))
