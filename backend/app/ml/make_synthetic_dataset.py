"""Generate a small synthetic Sentinel-1 σ⁰ dataset for a smoke-training run.

The real model should be trained on the Zenodo Sentinel-1 SAR Oil Spill Dataset
(10.5281/zenodo.8346860, 40 GB, GPU). This produces a few hundred physically
plausible σ⁰ dB tiles — speckled ocean with dark, low-texture slicks — in the
exact layout ``app.ml.dataset.OilSpillDataset`` expects, so the U-Net wiring and
the ``trained-unet`` inference path can be exercised end-to-end without the
download.

    python -m app.ml.make_synthetic_dataset --out app/ml/_synth_data --n 220
"""

from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

import cv2
import numpy as np
import tifffile

# Sentinel-1 ocean σ⁰: VV sits around −8 dB, VH ~6 dB lower; oil is a dark tail.
_OCEAN_VV_DB = -8.5
_VH_OFFSET_DB = -6.0
_SPECKLE_STD_DB = 2.1


def _wind_texture(size: int, rng: random.Random) -> np.ndarray:
    """Low-frequency brightness modulation (wind rows / gust cells)."""
    small = np.array(
        [[rng.uniform(-1.0, 1.0) for _ in range(6)] for _ in range(6)], np.float32
    )
    big = cv2.resize(small, (size, size), interpolation=cv2.INTER_CUBIC)
    ang = rng.uniform(0, math.pi)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    streak = np.sin((xx * math.cos(ang) + yy * math.sin(ang)) * rng.uniform(0.03, 0.09))
    return 0.9 * big + 0.6 * streak.astype(np.float32)


def _slick_mask(size: int, rng: random.Random) -> np.ndarray:
    """0/1 mask: one to three elongated, slightly wiggly blobs."""
    m = np.zeros((size, size), np.uint8)
    for _ in range(rng.randint(1, 3)):
        cx, cy = rng.randint(size // 5, size * 4 // 5), rng.randint(size // 5, size * 4 // 5)
        length = rng.randint(size // 7, int(size * 0.42))
        width = max(5, int(length * rng.uniform(0.22, 0.5)))
        ang = rng.uniform(0, 360)
        cv2.ellipse(m, (cx, cy), (length // 2, width // 2), ang, 0, 360, 255, -1)
        # a trailing sheen fragment
        if rng.random() < 0.6:
            dx = int(math.cos(math.radians(ang)) * length * 0.7)
            dy = int(math.sin(math.radians(ang)) * length * 0.7)
            cv2.ellipse(
                m, (cx + dx, cy + dy),
                (max(3, length // 5), max(2, width // 3)), ang, 0, 360, 255, -1,
            )
    # break the clean ellipse edge up a little
    noise = (np.random.default_rng(rng.randint(0, 1 << 30)).random((size, size)) > 0.5).astype(np.uint8) * 255
    noise = cv2.GaussianBlur(noise, (0, 0), size / 40)
    m = ((m > 0) & (noise > 90)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return (m > 0).astype(np.uint8)


def _make_tile(size: int, rng: random.Random, with_slick: bool) -> tuple[np.ndarray, np.ndarray]:
    gen = np.random.default_rng(rng.randint(0, 1 << 30))
    base_vv = _OCEAN_VV_DB + _wind_texture(size, rng) + gen.normal(0, _SPECKLE_STD_DB, (size, size)).astype(np.float32)
    mask = _slick_mask(size, rng) if with_slick else np.zeros((size, size), np.uint8)

    vv = base_vv.copy()
    if mask.any():
        soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), size / 45)
        drop = gen.uniform(9.0, 16.0)          # oil is 9–16 dB darker
        # slicks damp capillary waves → deep and far smoother inside
        inside = base_vv.mean() - drop * soft + gen.normal(0, 0.5, (size, size)).astype(np.float32)
        vv = np.where(soft > 0.25, inside, vv - drop * soft)

    vh = vv + _VH_OFFSET_DB + gen.normal(0, _SPECKLE_STD_DB * 0.8, (size, size)).astype(np.float32)
    img = np.stack([vv, vh], axis=-1).astype(np.float32)   # H, W, 2  (dB)
    return img, mask


def main() -> None:
    p = argparse.ArgumentParser(description="Synthesise a small SAR oil-spill dataset")
    p.add_argument("--out", default="app/ml/_synth_data")
    p.add_argument("--n", type=int, default=220)
    p.add_argument("--size", type=int, default=512)
    p.add_argument("--neg-frac", type=float, default=0.18)
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()

    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "masks").mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    for i in range(args.n):
        with_slick = rng.random() > args.neg_frac
        img, mask = _make_tile(args.size, rng, with_slick)
        stem = f"tile_{i:04d}"
        tifffile.imwrite(out / "images" / f"{stem}.tif", img)
        tifffile.imwrite(out / "masks" / f"{stem}.tif", mask.astype(np.uint8) * 255)
    print(f"wrote {args.n} pairs to {out}/  (size {args.size}, ~{int((1 - args.neg_frac) * 100)}% with a slick)")


if __name__ == "__main__":  # pragma: no cover
    main()
