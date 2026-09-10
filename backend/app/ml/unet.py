"""A compact U-Net for binary oil-spill segmentation.

2-channel input (Sentinel-1 sigma0 VV, VH), 1-channel logit output. Small enough to
train on modest hardware, standard enough that a bigger backbone can replace it
without touching the rest of the pipeline.
"""

from __future__ import annotations

import torch
from torch import nn


class _DoubleConv(nn.Module):
    def __init__(self, cin: int, cout: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class UNet(nn.Module):
    def __init__(self, in_ch: int = 2, out_ch: int = 1, base: int = 32) -> None:
        super().__init__()
        c = [base, base * 2, base * 4, base * 8]
        self.enc1 = _DoubleConv(in_ch, c[0])
        self.enc2 = _DoubleConv(c[0], c[1])
        self.enc3 = _DoubleConv(c[1], c[2])
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = _DoubleConv(c[2], c[3])
        self.up3 = nn.ConvTranspose2d(c[3], c[2], 2, stride=2)
        self.dec3 = _DoubleConv(c[3], c[2])
        self.up2 = nn.ConvTranspose2d(c[2], c[1], 2, stride=2)
        self.dec2 = _DoubleConv(c[2], c[1])
        self.up1 = nn.ConvTranspose2d(c[1], c[0], 2, stride=2)
        self.dec1 = _DoubleConv(c[1], c[0])
        self.head = nn.Conv2d(c[0], out_ch, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        b = self.bottleneck(self.pool(e3))
        d3 = self.dec3(torch.cat([self.up3(b), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
        return self.head(d1)


def dice_bce_loss(logits: torch.Tensor, target: torch.Tensor, eps: float = 1e-6) -> torch.Tensor:
    """Sum of BCE-with-logits and soft Dice — robust to the heavy class imbalance."""
    bce = nn.functional.binary_cross_entropy_with_logits(logits, target)
    probs = torch.sigmoid(logits)
    inter = (probs * target).sum(dim=(1, 2, 3))
    union = probs.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3))
    dice = 1.0 - ((2 * inter + eps) / (union + eps)).mean()
    return bce + dice
