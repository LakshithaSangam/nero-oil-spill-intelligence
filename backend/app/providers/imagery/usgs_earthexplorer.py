"""USGS EarthExplorer — alternate imagery provider (planned).
https://earthexplorer.usgs.gov/"""

from __future__ import annotations

from app.providers.imagery._planned import PlannedImageryProvider


class UsgsEarthExplorerImagery(PlannedImageryProvider):
    id = "usgs-earthexplorer"
    display_name = "USGS EarthExplorer"
    docs_url = "https://earthexplorer.usgs.gov/"
    required_env = ()

    def capabilities(self) -> dict[str, object]:
        return {"sensors": ["generic-optical"], "resolution_m": 30,
                "revisit_days": 16, "all_weather": False, "night_capable": False,
                "latency_hours": 48, "role": "alternate"}
