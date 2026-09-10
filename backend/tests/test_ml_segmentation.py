"""Smoke tests for the oil-spill segmentation training + inference path.

No network, no real dataset: a handful of synthetic sigma0-dB TIFF pairs (bright sea,
dark elliptical "slick") exercise the dataset loader, the U-Net, one real training
epoch via ``app.ml.train.train``, checkpoint round-trip, and
``TrainedUNetSegmentationModel`` inference. It asserts the plumbing works — not that
a model trained for one epoch on six images is any good.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pytest

torch = pytest.importorskip("torch")
tifffile = pytest.importorskip("tifffile")


@pytest.fixture
def synthetic_dataset(tmp_path: Path) -> Path:
    root = tmp_path / "ds"
    (root / "images").mkdir(parents=True)
    (root / "masks").mkdir(parents=True)
    rng = np.random.default_rng(0)
    for k in range(6):
        img = rng.normal(-12.0, 2.0, (256, 256, 2)).astype(np.float32)  # sea sigma0 dB
        mask = np.zeros((256, 256), np.uint8)
        cy, cx = rng.integers(80, 176, size=2)
        yy, xx = np.ogrid[:256, :256]
        ell = ((yy - cy) / 18.0) ** 2 + ((xx - cx) / 40.0) ** 2 <= 1.0
        img[ell] -= 12.0  # slick is markedly darker
        mask[ell] = 1
        tifffile.imwrite(root / "images" / f"{k:04d}.tif", img)
        tifffile.imwrite(root / "masks" / f"{k:04d}.tif", mask)
    return root


def test_dataset_loads_and_normalises(synthetic_dataset: Path) -> None:
    from app.ml.dataset import OilSpillDataset

    ds = OilSpillDataset(synthetic_dataset, split="train", crop=128, val_fraction=0.34)
    assert len(ds) >= 2
    img, msk = ds[0]
    assert img.shape == (2, 128, 128) and msk.shape == (1, 128, 128)
    assert float(img.min()) >= -1.0 and float(img.max()) <= 1.0
    assert set(np.unique(msk.numpy())) <= {0.0, 1.0}


def test_unet_forward_shape() -> None:
    from app.ml.unet import UNet, dice_bce_loss

    model = UNet(in_ch=2, base=8)
    x = torch.randn(2, 2, 128, 128)
    out = model(x)
    assert out.shape == (2, 1, 128, 128)
    loss = dice_bce_loss(out, torch.zeros_like(out))
    assert loss.item() >= 0.0


def test_train_one_epoch_writes_checkpoint(synthetic_dataset: Path, tmp_path: Path) -> None:
    from app.ml.train import train

    out = tmp_path / "ckpt.pt"
    train(argparse.Namespace(
        data=str(synthetic_dataset), out=str(out), epochs=1, batch=2, crop=128,
        base=8, lr=1e-3, workers=0, device="cpu", seed=0,
    ))
    assert out.exists()
    ckpt = torch.load(out, map_location="cpu")
    assert ckpt["in_ch"] == 2 and ckpt["base"] == 8 and "state_dict" in ckpt
    assert 0.0 <= ckpt["val_iou"] <= 1.0


@pytest.mark.asyncio
async def test_trained_model_infers_without_crashing(
    synthetic_dataset: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import cv2

    from app.ml.unet import UNet
    from app.modules.detection.trained_model import TrainedUNetSegmentationModel, _load_model
    from app.schemas.common import BBox
    from app.schemas.imagery import RasterTile

    # a minimal valid checkpoint
    ckpt = tmp_path / "m.pt"
    torch.save({"state_dict": UNet(2, 1, 8).state_dict(), "in_ch": 2, "base": 8,
                "crop": 128, "val_iou": 0.0, "meta": {}}, ckpt)
    _load_model.cache_clear()

    seg = TrainedUNetSegmentationModel(weights_path=str(ckpt))

    # patch the raster loader to a synthetic SAR-looking image with a dark blob
    img = np.full((200, 260), 150, np.uint8)
    img[70:130, 90:180] = 40
    png = cv2.imencode(".png", img)[1].tobytes()

    async def _load(_href: str) -> np.ndarray:
        return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)

    monkeypatch.setattr(seg, "_load", _load)

    box = BBox(west=70.0, south=18.0, east=71.0, north=19.0)
    result = await seg.infer(
        RasterTile(scene_id="x", bbox=box, width=260, height=200, href="http://x/r.png"), box
    )
    assert result.model_id == "trained-unet-v1"
    assert result.mask == [] or all(len(shape[0]) >= 4 for shape in result.mask)
    assert 0.0 <= result.pixel_confidence <= 1.0
