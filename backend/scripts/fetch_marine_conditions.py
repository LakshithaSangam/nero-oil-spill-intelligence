"""Fetch current ocean velocity and wind direction from the Open-Meteo Marine API.

No API key needed. Prints the raw JSON response, pretty-printed.

Usage:
    python scripts/fetch_marine_conditions.py [lat] [lon]

Defaults to 20.44, 69.02 (the Arabian Sea replay scenario's origin) if no
coordinates are given.

Docs: https://open-meteo.com/en/docs/marine-weather-api
"""

from __future__ import annotations

import json
import sys

import requests

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
WIND_URL = "https://api.open-meteo.com/v1/forecast"


def fetch_marine_conditions(lat: float, lon: float) -> dict:
    """Fetch ocean current velocity/direction and 10 m wind for one point.

    Two calls, since Open-Meteo splits marine (waves, currents, sea surface
    temperature) and atmospheric (wind) data across separate endpoints.
    """
    marine = requests.get(
        MARINE_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "ocean_current_velocity,ocean_current_direction,wave_height,sea_surface_temperature",
            "forecast_days": 1,
        },
        timeout=15,
    )
    marine.raise_for_status()

    wind = requests.get(
        WIND_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "wind_speed_10m,wind_direction_10m",
            "wind_speed_unit": "ms",
            "forecast_days": 1,
        },
        timeout=15,
    )
    wind.raise_for_status()

    return {
        "location": {"lat": lat, "lon": lon},
        "marine": marine.json(),
        "wind": wind.json(),
    }


def main() -> None:
    lat = float(sys.argv[1]) if len(sys.argv) > 1 else 20.44
    lon = float(sys.argv[2]) if len(sys.argv) > 2 else 69.02

    result = fetch_marine_conditions(lat, lon)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
