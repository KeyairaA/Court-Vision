"""Tests for the mirror adapter, league trends, and the artifact build.

The build tests focus on the properties that make it safe to run unattended:
it refuses gapped windows and unreconciled data, it never emits NaN or Infinity,
and a failed build leaves the published artifacts exactly as they were.
"""

from __future__ import annotations

import io
import json
from datetime import UTC, datetime

import pandas as pd
import pytest
import requests

from courtvision.artifacts.build import BuildFailed, build_artifacts, write_artifacts
from courtvision.domain.franchise import FranchiseRegistry
from courtvision.ingest import mirror
from courtvision.ingest.mirror import (
    MirrorFile,
    MirrorSchemaChanged,
    MirrorUnavailable,
    fetch_season,
    validate_frame,
)
from courtvision.metrics.league import season_trend_row
from tests.conftest import make_season

NOW = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)


def as_file(frame: pd.DataFrame, season: int) -> MirrorFile:
    return MirrorFile(
        season=season,
        url=f"https://example/{season}",
        frame=frame,
        last_modified="2026-09-20T17:26:10+00:00",
        etag="x",
        sha256="0" * 64,
        from_cache=True,
    )


def two_seasons() -> list[MirrorFile]:
    return [as_file(make_season(season=2025), 2025), as_file(make_season(season=2026), 2026)]


# ---------------------------------------------------------------- mirror ----


class FakeResponse:
    def __init__(self, status: int, content: bytes = b"", headers: dict | None = None):
        self.status_code, self.content, self.headers = status, content, headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


class FakeSession:
    def __init__(self, responses: list):
        self.responses, self.calls = list(responses), 0

    def get(self, url, timeout):
        self.calls += 1
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def parquet_bytes(frame: pd.DataFrame) -> bytes:
    buffer = io.BytesIO()
    frame.to_parquet(buffer, index=False)
    return buffer.getvalue()


class TestMirror:
    def test_downloads_validates_and_records_provenance(self, tmp_path):
        payload = parquet_bytes(make_season())
        session = FakeSession(
            [
                FakeResponse(
                    200,
                    payload,
                    {"Last-Modified": "Sun, 20 Sep 2026 17:26:10 GMT", "ETag": '"abc"'},
                )
            ]
        )
        result = fetch_season(2026, cache_dir=tmp_path, session=session)
        assert result.last_modified == "2026-09-20T17:26:10+00:00"
        assert result.etag == '"abc"'
        assert not result.from_cache
        assert result.provenance()["rows"] == len(result.frame)

    def test_cache_is_used_on_second_fetch(self, tmp_path):
        payload = parquet_bytes(make_season())
        fetch_season(2026, cache_dir=tmp_path, session=FakeSession([FakeResponse(200, payload)]))
        second = fetch_season(2026, cache_dir=tmp_path, session=FakeSession([]))
        assert second.from_cache

    def test_404_is_a_clear_failure(self):
        with pytest.raises(MirrorUnavailable, match="404"):
            fetch_season(2026, session=FakeSession([FakeResponse(404)]))

    def test_transient_errors_are_retried(self, monkeypatch):
        monkeypatch.setattr(mirror.time, "sleep", lambda _s: None)
        payload = parquet_bytes(make_season())
        session = FakeSession([requests.ConnectionError("blip"), FakeResponse(200, payload)])
        assert fetch_season(2026, session=session).frame is not None
        assert session.calls == 2

    def test_missing_columns_mean_the_schema_changed(self):
        with pytest.raises(MirrorSchemaChanged, match="missing required columns"):
            validate_frame(make_season().drop(columns=["team_id"]), 2026)

    def test_a_file_containing_the_wrong_season_is_refused(self):
        with pytest.raises(MirrorSchemaChanged, match="contains seasons"):
            validate_frame(make_season(season=2025), 2026)


# ---------------------------------------------------------------- league ----


class TestLeagueTrends:
    def test_computed_from_team_rows_per_team_game(self, season_logs):
        team = season_logs[season_logs["player_id"].isna()]
        players = season_logs[season_logs["player_id"].notna()]
        row = season_trend_row(team, players)
        assert row["games"] == 4
        assert row["teams"] == 2
        assert row["games_per_team"] == 4.0
        expected_pts = team["pts"].sum() / 8
        assert row["pts_per_team_game"] == pytest.approx(expected_pts)

    def test_turnovers_include_team_turnovers(self):
        logs = make_season(team_turnovers=3)
        team = logs[logs["player_id"].isna()]
        players = logs[logs["player_id"].notna()]
        row = season_trend_row(team, players)
        player_tov_per_team_game = players["tov"].sum() / 8
        assert row["tov_per_team_game"] == pytest.approx(player_tov_per_team_game + 3)

    def test_forfeits_do_not_count_as_games(self, season_logs):
        team = season_logs[season_logs["player_id"].isna()].copy()
        forfeit = team.iloc[:2].copy()
        forfeit["game_id"], forfeit["min"], forfeit["pts"] = "FORFEIT", 0.0, 0.0
        row = season_trend_row(
            pd.concat([team, forfeit]), season_logs[season_logs["player_id"].notna()]
        )
        assert row["games"] == 4


# ----------------------------------------------------------------- build ----


class TestBuild:
    @pytest.fixture
    def registry(self) -> FranchiseRegistry:
        return FranchiseRegistry.load()

    def test_produces_every_artifact(self, registry):
        result = build_artifacts(two_seasons(), registry, now=NOW)
        assert set(result.artifacts) == {
            "manifest",
            "league-trends",
            "player-seasons",
            "careers",
            "franchises",
        }

    def test_no_nan_or_infinity_anywhere(self, registry):
        result = build_artifacts(two_seasons(), registry, now=NOW)
        for payload in result.artifacts.values():
            json.dumps(payload, allow_nan=False)

    def test_manifest_records_quality_and_methodology(self, registry):
        manifest = build_artifacts(two_seasons(), registry, now=NOW).artifacts["manifest"]
        assert manifest["generated_at"] == "2026-09-21T12:00:00+00:00"
        assert manifest["methodology"]["true_shooting_ft_coefficient"] == 0.44
        assert manifest["quality"]["2026"]["coverage"] == 1.0
        assert manifest["quality"]["2026"]["team_games_reconciled"] == 8
        assert manifest["partial_seasons"] == []

    def test_labels_come_from_the_franchise_registry(self, registry):
        rows = build_artifacts(two_seasons(), registry, now=NOW).artifacts["player-seasons"]
        assert {r["franchise_slug"] for r in rows} == {"new-york-liberty", "seattle-storm"}

    def test_a_gapped_window_is_refused(self, registry):
        files = [as_file(make_season(season=2024), 2024), as_file(make_season(season=2026), 2026)]
        with pytest.raises(BuildFailed, match="gaps"):
            build_artifacts(files, registry, now=NOW)

    def test_unreconciled_data_is_refused(self, registry):
        corrupt = make_season(season=2026)
        idx = corrupt[corrupt["player_id"].notna()].index[0]
        corrupt.loc[idx, "pts"] += 5
        with pytest.raises(BuildFailed, match="reconciliation"):
            build_artifacts([as_file(corrupt, 2026)], registry, now=NOW)

    def test_a_partial_season_is_flagged_not_hidden(self, registry):
        partial = as_file(make_season(season=2026, games=10, drop_player_rows_after=6), 2026)
        result = build_artifacts([partial], registry, now=NOW)
        assert result.artifacts["manifest"]["partial_seasons"] == [2026]
        assert any("PARTIAL" in w for w in result.warnings)

    def test_strict_mode_refuses_a_partial_season(self, registry):
        partial = as_file(make_season(season=2026, games=10, drop_player_rows_after=6), 2026)
        with pytest.raises(BuildFailed, match="PARTIAL"):
            build_artifacts([partial], registry, now=NOW, strict=True)


class TestAtomicWrite:
    def test_writes_every_file_and_indexes_them(self, tmp_path):
        result = build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW)
        out = tmp_path / "v1"
        index = write_artifacts(result, out).index
        assert {p.name for p in out.iterdir()} == {f"{n}.json" for n in result.artifacts}
        manifest = json.loads((out / "manifest.json").read_text())
        assert manifest["artifacts"] == index
        assert not (tmp_path / "v1.staging").exists()
        assert not (tmp_path / "v1.previous").exists()

    def test_a_failed_build_leaves_published_artifacts_untouched(self, tmp_path):
        out = tmp_path / "v1"
        write_artifacts(build_artifacts(two_seasons(), FranchiseRegistry.load(), now=NOW), out)
        before = {p.name: p.read_bytes() for p in out.iterdir()}

        corrupt = make_season(season=2026)
        corrupt.loc[corrupt[corrupt["player_id"].notna()].index[0], "pts"] += 5
        with pytest.raises(BuildFailed):
            write_artifacts(
                build_artifacts([as_file(corrupt, 2026)], FranchiseRegistry.load(), now=NOW), out
            )

        assert {p.name: p.read_bytes() for p in out.iterdir()} == before
