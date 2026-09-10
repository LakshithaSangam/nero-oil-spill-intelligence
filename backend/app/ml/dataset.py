"""Dataset + normalisation for the Sentinel-1 SAR Oil Spill collection.

Point ``root`` at wherever the Zenodo .7z archives were unpacked. Pairing is by file
*stem*: every ``.tif`` whose parent folder name contains "mask" is a label, the rest
are images — so both ``images/`` + ``masks/`` and the archives' native
``Sigma0_oil/`` + ``Mask_oil/`` layouts work.

Images are 2048x2048x2 sigma0 dB [VV, VH]; masks are 2048x2048 {0, 1}.
``split="train"`` yields random crops with flips; ``split="val"`` the centre crop.
Sigma0 dB is clamped to a sensible ocean range and scaled to ~[-1, 1].
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

# Sentinel-1 ocean sigma0 (dB) sits roughly in this band; oil is the dark tail.
_DB_LO, _DB_HI = -35.0, 0.0


def normalise_db(arr: np.ndarray) -> np.ndarray:
    arr = np.clip(arr.astype(np.float32), _DB_LO, _DB_HI)
    return (arr - _DB_LO) / (_DB_HI - _DB_LO) * 2.0 - 1.0


def _list_pairs(root: Path) -> list[tuple[Path, Path]]:
    masks: dict[str, Path] = {}
    images: dict[str, Path] = {}
    for tif in root.rglob("*.tif*"):
        bucket = masks if "mask" in tif.parent.name.lower() else images
        bucket[tif.stem] = tif
    return [(images[s], masks[s]) for s in sorted(images) if s in masks]


class OilSpillDataset(Dataset):
    def __init__(self, root: str | Path, *, split: str = "train", crop: int = 512,
                 val_fraction: float = 0.1, seed: int = 0) -> None:
        self.crop = crop
        self.split = split
        pairs = _list_pairs(Path(root))
        if not pairs:
            raise FileNotFoundError(f"no image/mask pairs under {root} (expect images/ and masks/)")
        rng = random.Random(seed)
        rng.shuffle(pairs)
        cut = max(1, int(len(pairs) * val_fraction))
        self.pairs = pairs[cut:] if split == "train" else pairs[:cut]

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        import tifffile

        img_path, msk_path = self.pairs[i]
        img = tifffile.imread(img_path)          # H, W, 2
        msk = tifffile.imread(msk_path)          # H, W
        if img.ndim == 2:
            img = np.stack([img, img], axis=-1)
        img = normalise_db(img)
        msk = (msk > 0).astype(np.float32)

        h, w = msk.shape
        c = min(self.crop, h, w)
        if self.split == "train":
            y = random.randint(0, h - c)
            x = random.randint(0, w - c)
        else:
            y, x = (h - c) // 2, (w - c) // 2
        img = img[y:y + c, x:x + c, :]
        msk = msk[y:y + c, x:x + c]

        if self.split == "train":
            if random.random() < 0.5:
                img, msk = img[:, ::-1, :], msk[:, ::-1]
            if random.random() < 0.5:
                img, msk = img[::-1, :, :], msk[::-1, :]

        img_t = torch.from_numpy(np.ascontiguousarray(img.transpose(2, 0, 1)))
        msk_t = torch.from_numpy(np.ascontiguousarray(msk))[None, :, :]
        return img_t.float(), msk_t.float()
