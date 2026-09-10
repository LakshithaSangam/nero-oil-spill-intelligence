"""NASA Earthdata — alternate imagery provider (planned). https://earthdata.nasa.gov/"""

from __future__ import annotations

from app.providers.imagery._planned import PlannedImageryProvider


class NasaEarthdataImagery(PlannedImageryProvider):
    id = "nasa-earthdata"
    display_name = "NASA Earthdata"
    docs_url = "https://earthdata.nasa.gov/"
    required_env = ("EARTHDATA_TOKEN",)

    def capabilities(self) -> dict[str, object]:
        return {"sensors": ["generic-sar", "generic-optical"], "resolution_m": 30,
                "revisit_days": 12, "all_weather": False, "night_capable": False,
                "latency_hours": 24, "role": "alternate"}
