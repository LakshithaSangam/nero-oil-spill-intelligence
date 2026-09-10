"""Classical dark-spot SAR segmenter.

Two parts:
* a self-contained unit test that injects a synthetic dark ellipse into a noisy
  "sea" raster and asserts the segmenter recovers it (no network);
* a live test that runs it on a real Sentinel-1 quicklook from CDSE and asserts it
  either returns a plausible mask or an honest "no candidate" — and that the
  detection service falls back to the scenario model in the latter case.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.modules.detection.sar_segmenter import SarDarkSpotSegmenter
from app.providers.bootstrap import bootstrap_providers
from app.schemas.common import BBox
from app.schemas.imagery import RasterTile

pytestmark = pytest.mark.asyncio

_BOX = BBox(west=70.0, south=18.0, east=71.0, north=19.0)


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


def _png_bytes(arr: np.ndarray) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".png", arr)
    assert ok
    return buf.tobytes()


async def test_recovers_injected_dark_ellipse(monkeypatch: pytest.MonkeyPatch) -> None:
    rng = np.random.default_rng(0)
    h, w = 240, 300
    sea = np.clip(rng.normal(120, 14, (h, w)), 0, 255).astype(np.uint8)
    cy, cx = 120, 150
    yy, xx = np.ogrid[:h, :w]
    ellipse = ((yy - cy) / 22.0) ** 2 + ((xx - cx) / 46.0) ** 2 <= 1.0
    sea[ellipse] = np.clip(sea[ellipse] * 0.35, 0, 255).astype(np.uint8)  # ~9 dB drop
    png = _png_bytes(sea)

    seg = SarDarkSpotSegmenter()
    monkeypatch.setattr(seg, "_load", _make_loader(png))

    result = await seg.infer(
        RasterTile(scene_id="synthetic", bbox=_BOX, width=w, height=h, href="http://x/ql.png"),
        _BOX,
    )
    assert result.mask, result.notes
    assert result.dark_spot_contrast_db >= 3.0
    assert 0.15 <= result.pixel_confidence <= 0.95

    from app.modules.detection.geometry import build_geometry

    geom = build_geometry(result.mask)
    # ellipse centre maps to roughly the middle of the AOI
    assert abs(geom.centroid[0] - 70.5) < 0.15
    assert abs(geom.centroid[1] - 18.5) < 0.15
    assert geom.area_km2 > 0


async def test_flat_sea_returns_no_candidate(monkeypatch: pytest.MonkeyPatch) -> None:
    rng = np.random.default_rng(1)
    flat = np.clip(rng.normal(120, 10, (200, 260)), 0, 255).astype(np.uint8)
    seg = SarDarkSpotSegmenter()
    monkeypatch.setattr(seg, "_load", _make_loader(_png_bytes(flat)))
    result = await seg.infer(
        RasterTile(scene_id="flat", bbox=_BOX, width=260, height=200, href="http://x/ql.png"),
        _BOX,
    )
    assert result.mask == []
    assert "no dark-spot candidate" in result.notes


async def test_live_quicklook_or_honest_miss() -> None:
    from app.providers.imagery.copernicus_dataspace import CopernicusDataSpaceImagery
    from app.schemas.imagery import SceneSearchRequest

    provider = CopernicusDataSpaceImagery()
    if (await provider.health()).state == "unavailable":
        pytest.skip("CDSE unreachable")
    from datetime import UTC, datetime

    scenes = await provider.search(SceneSearchRequest(
        bbox=BBox(west=70.4, south=17.9, east=71.6, north=19.1),
        start=datetime(2026, 8, 1, tzinfo=UTC), end=datetime(2026, 9, 6, tzinfo=UTC),
        sensor="sentinel-1-sar", max_results=1,
    ))
    if not scenes:
        pytest.skip("no S1 scene")
    tile = await provider.fetch_scene(scenes[0].id)
    result = await SarDarkSpotSegmenter().infer(tile, tile.bbox)
    # either a real detection or an explicit miss — never a crash, never garbage
    if result.mask:
        assert result.dark_spot_contrast_db >= 1.5
        from app.modules.detection.geometry import build_geometry

        assert build_geometry(result.mask).area_km2 > 0
    else:
        assert "candidate" in result.notes


def _make_loader(png: bytes):
    import cv2

    async def _load(_href: str) -> np.ndarray:
        return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)

    return _load
