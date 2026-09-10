"""Oil-spill segmentation model training + inference (opt-in).

Data: the Sentinel-1 SAR Oil Spill Dataset (Zenodo 10.5281/zenodo.8346860) —
2048×2048×2 sigma0 GeoTIFFs (VV, VH) paired with binary masks. Train on a GPU box
with ``python -m app.ml.train``; drop the checkpoint in and set
``SEGMENTATION_MODEL=trained-unet`` + ``SEGMENTATION_WEIGHTS=<path>``.
"""
