"""MarineCadastre US AIS provider.

The pure parsing / mapping helpers are unit-tested with no network. The end-to-end
``tracks()`` check only runs if a daily archive zip is already cached (they are
~300 MB — the test never downloads one).
"""

from __future__ import annotations

import zipfile
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.providers.ais.base import AISProvider
from app.providers.ais.marine_cadastre import (
    MarineCadastreAISProvider,
    _days,
    _extract_tracks,
    _ship_type,
)
from app.schemas.ais import AISQuery
from app.schemas.common import BBox


def test_ship_type_mapping() -> None:
    assert _ship_type("80") == "tanker"
    assert _ship_type("70") == "cargo"
    assert _ship_type("31") == "tug"
    assert _ship_type("60") == "passenger"
    assert _ship_type("30") == "fishing"
    assert _ship_type("") == "unknown"
    assert _ship_type("0") == "unknown"


def test_days_window_is_capped() -> None:
    got = _days(date(2024, 1, 1), date(2024, 1, 31))
    assert got[0] == date(2024, 1, 1)
    assert len(got) <= 4  # _MAX_DAYS


@pytest.mark.asyncio
async def test_conformant_and_fleet_empty() -> None:
    provider = MarineCadastreAISProvider()
    assert isinstance(provider, AISProvider)
    assert provider.is_mock is False
    assert await provider.fleet() == []


def _cached_zip() -> Path | None:
    cache = Path(get_settings().marinecadastre_cache_dir)
    files = sorted(cache.glob("AIS_*.zip")) if cache.exists() else []
    return files[0] if files else None


@pytest.mark.asyncio
async def test_tracks_from_cached_archive() -> None:
    zip_path = _cached_zip()
    if zip_path is None:
        pytest.skip("no cached MarineCadastre daily archive (test never downloads one)")

    # date is encoded in the filename: AIS_YYYY_MM_DD.zip
    y, m, d = (int(x) for x in zip_path.stem.split("_")[1:4])
    with zipfile.ZipFile(zip_path) as zf:  # sanity: single CSV member
        assert any(n.lower().endswith(".csv") for n in zf.namelist())

    q = AISQuery(
        bbox=BBox(west=-74.2, south=40.3, east=-73.7, north=40.8),  # NY harbour approaches
        start=datetime(y, m, d, 12, 0, tzinfo=UTC),
        end=datetime(y, m, d, 13, 0, tzinfo=UTC),
    )
    tracks = _extract_tracks([zip_path], q)
    assert tracks, "expected vessels in NY harbour during the window"
    for t in tracks:
        assert t.vessel.mmsi
        assert t.positions
        assert t.positions == sorted(t.positions, key=lambda p: p.time)
        for p in t.positions:
            assert q.bbox.west <= p.position.lon <= q.bbox.east
            assert q.start <= p.time <= q.end
        assert t.has_gaps == bool(t.gap_intervals)
    assert [len(t.positions) for t in tracks] == sorted(
        (len(t.positions) for t in tracks), reverse=True
    )
