"""Sentinel Hub — alternate imagery provider (planned). https://www.sentinel-hub.com/"""

from __future__ import annotations

from app.providers.imagery._planned import PlannedImageryProvider


class SentinelHubImagery(PlannedImageryProvider):
    id = "sentinel-hub"
    display_name = "Sentinel Hub"
    docs_url = "https://www.sentinel-hub.com/"
    required_env = ("SENTINELHUB_CLIENT_ID", "SENTINELHUB_CLIENT_SECRET")

    def capabilities(self) -> dict[str, object]:
        return {"sensors": ["sentinel-1-sar", "sentinel-2-eo"], "resolution_m": 10,
                "revisit_days": 6, "all_weather": True, "night_capable": True,
                "latency_hours": 6, "role": "alternate"}
