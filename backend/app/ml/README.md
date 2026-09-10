# Oil-spill segmentation model

A trained U-Net that replaces the mock / classical detector when
`SEGMENTATION_MODEL=trained-unet`. Everything here is optional — install the extra
deps only if you want to train or run it:

```bash
pip install -r requirements-ml.txt      # torch (CPU), tifffile, py7zr
```

## 1. Get the data

**Sentinel-1 SAR Oil Spill Dataset — Part I**, Zenodo `10.5281/zenodo.8346860`
(CC-BY-4.0): 1,200 Sentinel-1 σ⁰ dB image pairs (VV, VH; 2048×2048) + binary masks.

```bash
# images 40.7 GB, masks 6.2 MB
curl -L -o images.7z "https://zenodo.org/api/records/8346860/files/01_Train_Val_Oil_Spill_images.7z/content"
curl -L -o masks.7z  "https://zenodo.org/api/records/8346860/files/01_Train_Val_Oil_Spill_mask.7z/content"
7z x images.7z -o./zenodo_8346860
7z x masks.7z  -o./zenodo_8346860
```

`OilSpillDataset` pairs files by stem, so the archives' native `Sigma0_oil/` +
`Mask_oil/` folders work as-is — just point `--data` at the parent.

## 2. Train

```bash
python -m app.ml.train --data ./zenodo_8346860 --epochs 50 \
       --crop 512 --batch 8 --device cuda --out weights/oilspill_unet.pt
```

CPU works for a smoke run but is impractical for real training (no GPU here → use
Colab / a GPU box). The checkpoint is `{state_dict, in_ch, base, crop, val_iou, meta}`.

## 3. Use it

```
# backend/.env
SEGMENTATION_MODEL=trained-unet
SEGMENTATION_WEIGHTS=/abs/path/weights/oilspill_unet.pt
```

`TrainedUNetSegmentationModel` loads the checkpoint, runs the model over the raster in
overlapping 512-tiles, thresholds the probability map, and vectorises blobs to geo
polygons. If the checkpoint is missing or the map is empty, the detection service
falls back to the scenario model.

**Caveat:** the model is trained on calibrated full-resolution σ⁰. Given only the
keyless 8-bit quicklook it runs on a min-max stretch — a real inference path, but the
calibrated GRD (needs Copernicus Data Space credentials) is what it is designed for.
