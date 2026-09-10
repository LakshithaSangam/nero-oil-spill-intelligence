"""Train the oil-spill U-Net.

    python -m app.ml.train --data /path/to/zenodo_8346860 --epochs 50 --out weights/oilspill_unet.pt

CPU works for a smoke run; real training wants a GPU (``--device cuda``). The
checkpoint is a dict: ``{"state_dict", "in_ch", "base", "crop", "val_iou", "meta"}``
— ``app.modules.detection.models.TrainedUNetSegmentationModel`` loads exactly this.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from app.ml.dataset import OilSpillDataset
from app.ml.unet import UNet, dice_bce_loss


@torch.no_grad()
def _iou(logits: torch.Tensor, target: torch.Tensor, thr: float = 0.5) -> float:
    pred = (torch.sigmoid(logits) > thr).float()
    inter = (pred * target).sum().item()
    union = (pred + target - pred * target).sum().item()
    return inter / union if union > 0 else 1.0


def train(args: argparse.Namespace) -> None:
    device = torch.device(args.device)
    torch.manual_seed(args.seed)

    tr = OilSpillDataset(args.data, split="train", crop=args.crop, seed=args.seed)
    va = OilSpillDataset(args.data, split="val", crop=args.crop, seed=args.seed)
    print(f"train {len(tr)} / val {len(va)} images, crop {args.crop}, device {device}")
    tl = DataLoader(tr, batch_size=args.batch, shuffle=True, num_workers=args.workers, drop_last=True)
    vl = DataLoader(va, batch_size=args.batch, shuffle=False, num_workers=args.workers)

    model = UNet(in_ch=2, base=args.base).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    best_iou = -1.0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, run = time.time(), 0.0
        for img, msk in tl:
            img, msk = img.to(device), msk.to(device)
            opt.zero_grad()
            loss = dice_bce_loss(model(img), msk)
            loss.backward()
            opt.step()
            run += loss.item()
        model.eval()
        ious = []
        with torch.no_grad():
            for img, msk in vl:
                ious.append(_iou(model(img.to(device)), msk.to(device)))
        val_iou = sum(ious) / max(len(ious), 1)
        print(f"epoch {epoch:3d}  loss {run / max(len(tl), 1):.4f}  val_iou {val_iou:.3f}  "
              f"{time.time() - t0:.0f}s")
        if val_iou > best_iou:
            best_iou = val_iou
            torch.save({
                "state_dict": model.state_dict(),
                "in_ch": 2, "base": args.base, "crop": args.crop,
                "val_iou": round(val_iou, 4),
                "meta": {"dataset": "zenodo-8346860", "epochs_run": epoch},
            }, out)
            print(f"  saved {out} (val_iou {val_iou:.3f})")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Train the oil-spill segmentation U-Net")
    p.add_argument("--data", required=True, help="root with images/ and masks/ subdirs")
    p.add_argument("--out", default="weights/oilspill_unet.pt")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--crop", type=int, default=512)
    p.add_argument("--base", type=int, default=32)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--seed", type=int, default=0)
    return p


if __name__ == "__main__":  # pragma: no cover
    train(build_parser().parse_args())
