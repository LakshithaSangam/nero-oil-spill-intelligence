"""Test-wide defaults.

The unit / integration suite must run on the deterministic mock providers, never on
whatever ``backend/.env`` happens to select for local development (e.g. a real,
slow, network-bound CMEMS or Open-Meteo provider). Environment variables take
precedence over the ``.env`` file in pydantic-settings, so forcing them here — before
``Settings`` is first constructed — pins every domain to ``mock``.

The live provider tests (``test_open_meteo_provider.py``,
``test_copernicus_marine_provider.py``) opt back in explicitly with
``registry.set_selection(...)`` and read credentials straight from settings.
"""

from __future__ import annotations

import os

for _var in ("IMAGERY_PROVIDER", "INCIDENT_PROVIDER", "OCEANOGRAPHY_PROVIDER", "AIS_PROVIDER"):
    os.environ[_var] = "mock"

from app.core.config import get_settings  # noqa: E402  (must follow the env pins)

get_settings.cache_clear()
