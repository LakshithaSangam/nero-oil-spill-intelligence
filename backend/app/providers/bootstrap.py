"""Register every known provider and apply the env-driven selection.

Called once at app startup. Planned (not-yet-implemented) providers are registered
too, so the /providers screen reflects the full intended topology; they simply report
``unavailable`` until milestone M∞.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.ais.global_fishing_watch import GlobalFishingWatchAISProvider
from app.providers.ais.marine_cadastre import MarineCadastreAISProvider
from app.providers.ais.mock import MockAISProvider
from app.providers.imagery.copernicus_dataspace import CopernicusDataSpaceImagery
from app.providers.imagery.hybrid import HybridImageryProvider
from app.providers.imagery.mock import MockImageryProvider
from app.providers.imagery.nasa_earthdata import NasaEarthdataImagery
from app.providers.imagery.sentinel_hub import SentinelHubImagery
from app.providers.imagery.usgs_earthexplorer import UsgsEarthExplorerImagery
from app.providers.incidents.hybrid import HybridIncidentProvider
from app.providers.incidents.mock import MockIncidentProvider
from app.providers.incidents.noaa import NoaaIncidentProvider
from app.providers.oceanography.copernicus_marine import CopernicusMarineProvider
from app.providers.oceanography.mock import MockOceanographyProvider
from app.providers.oceanography.open_meteo_marine import OpenMeteoMarineProvider
from app.providers.registry import registry

log = get_logger(__name__)


def bootstrap_providers() -> None:
    for provider in (
        # imagery
        MockImageryProvider(),
        CopernicusDataSpaceImagery(),
        HybridImageryProvider(),
        SentinelHubImagery(),
        NasaEarthdataImagery(),
        UsgsEarthExplorerImagery(),
        # incidents
        MockIncidentProvider(),
        NoaaIncidentProvider(),
        HybridIncidentProvider(),
        # oceanography
        MockOceanographyProvider(),
        CopernicusMarineProvider(),
        OpenMeteoMarineProvider(),
        # ais
        MockAISProvider(),
        MarineCadastreAISProvider(),
        GlobalFishingWatchAISProvider(),
    ):
        registry.register(provider)

    registry.set_selection(get_settings().provider_selection)
    log.info("provider selection: %s", get_settings().provider_selection)
