"""Inline-SVG visualisations for the printable investigation report.

Pure functions: model objects in, a self-contained ``<svg>`` string out (no external
assets, so they survive "Save as PDF"). Kept out of ``report_generator`` to keep that
file focused on assembly.
"""

from __future__ import annotations

import re
from html import escape

# ---- ownership / risk classifications (mirror of frontend src/lib/assess) ---- #

_NAVAL_RE = re.compile(
    r"\b(navy|naval|warship|coast\s?guard|coastguard|hmas|hmcs|hms|uss|ins|pns|"
    r"frigate|corvette|destroyer|patrol\s+(vessel|boat)|auxiliary fleet)\b",
    re.I,
)
_GOV_RE = re.compile(
    r"\b(ministry|govt|government|national|state|federal|authority|port trust|"
    r"shipping corporation|maritime board|fisheries department|customs|survey of india|psu)\b",
    re.I,
)
_PRIVATE_RE = re.compile(
    r"\b(ltd|limited|inc\.?|llc|l\.l\.c|gmbh|s\.a\.|pte|plc|bhd|co\.?|corp\.?|company|"
    r"shipping|maritime|tankers?|carriers?|lines?|marine|holdings?|group|enterprises?|"
    r"logistics|petroleum|energy|offshore)\b",
    re.I,
)

_CRITICAL_KINDS = {"coral-reef", "marine-protected-area", "turtle-nesting", "mangrove", "seagrass"}


def operator_class(vessel) -> tuple[str, str]:  # noqa: ANN001
    """(classification, basis) — Private company / Government / Naval-Coast Guard / Other / Unknown."""
    hay = f"{vessel.owner or ''} {vessel.operator_company or ''} {vessel.name or ''}".strip()
    if vessel.vessel_type == "military" or _NAVAL_RE.search(hay):
        m = _NAVAL_RE.search(hay)
        basis = (
            "vessel type recorded as military"
            if vessel.vessel_type == "military"
            else f'name/operator matches "{m.group(0)}"'
        )
        return "Naval / Coast Guard authority", basis
    if _GOV_RE.search(hay):
        return "Government organisation", f'operator name matches "{_GOV_RE.search(hay).group(0)}"'
    if _PRIVATE_RE.search(hay):
        who = vessel.operator_company or vessel.owner or "operator on record"
        return "Private company", f'{who} ({vessel.flag_state or "flag n/a"})'
    if vessel.operator_company or vessel.owner:
        return "Other registered operator", str(vessel.operator_company or vessel.owner)
    return "Unknown, not on public record", "no ownership entry in the registries queried"


def biodiversity_risk(env) -> tuple[str, str]:  # noqa: ANN001
    """(band, rationale) for marine-biodiversity risk near the drift path."""
    reached = [r for r in env.receptors if r.likelihood > 0.15]
    max_sens = max((r.sensitivity for r in reached), default=0.0)
    max_exp = max((r.exposure for r in reached), default=0.0)
    crit = sum(1 for r in reached if r.kind in _CRITICAL_KINDS)
    nearest = min((r.distance_km for r in reached), default=float("inf"))
    s = 0.45 * max_sens + 0.3 * max_exp + 0.15 * min(1.0, crit / 2) + 0.1 * (1.0 if nearest < 15 else 0.0)
    if s >= 0.75 or crit >= 2:
        band = "Critical"
    elif s >= 0.5 or crit >= 1:
        band = "High"
    elif s >= 0.28 or reached:
        band = "Moderate"
    else:
        band = "Low"
    if reached:
        kinds = ", ".join(sorted({r.kind.replace("-", " ") for r in reached})[:3])
        why = f"{kinds} in the drift path" + (
            f", nearest ~{nearest:.0f} km" if nearest != float("inf") else ""
        ) + f"; peak drift exposure {max_exp * 100:.0f}%."
    else:
        why = "No sensitive receptor is projected to be reached within the forecast horizon."
    return band, why


def cleanup_urgency(priority_score: float, biod_band: str) -> tuple[str, int, str]:
    """(level, 0-100 score, guidance) — the cleanup urgency indicator."""
    score = round(max(0.0, min(1.0, priority_score)) * 100)
    if score >= 80:
        level = "Critical"
    elif score >= 60:
        level = "High"
    elif score >= 35:
        level = "Medium"
    else:
        level = "Low"
    if biod_band in ("High", "Critical") or score >= 60:
        guidance = (
            "Dense or highly sensitive marine biodiversity lies in the drift path, so "
            "cleanup and containment should begin immediately."
        )
    else:
        guidance = (
            "Ecological sensitivity along the drift path is relatively low, so there is "
            "more time available before severe ecological damage occurs, though early "
            "containment still limits cost."
        )
    return level, score, guidance


# ---- SVG helpers ---------------------------------------------------------- #

def _bounds(pts: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _projector(pts: list[tuple[float, float]], w: int, h: int, pad: int = 24):
    import math

    minx, miny, maxx, maxy = _bounds(pts)
    dx = (maxx - minx) or 1e-4
    dy = (maxy - miny) or 1e-4
    latm = math.cos(math.radians((miny + maxy) / 2)) or 1e-3
    dx_m = dx * latm  # east-west extent in "lat-equivalent" degrees

    iw, ih = w - 2 * pad, h - 2 * pad
    scale = min(iw / dx_m, ih / dy)          # uniform: preserve aspect
    ox = pad + (iw - dx_m * scale) / 2       # centre the drawing in both axes
    oy = pad + (ih - dy * scale) / 2

    def proj(lon: float, lat: float) -> tuple[float, float]:
        x = ox + (lon - minx) * latm * scale
        y = h - oy - (lat - miny) * scale     # flip: north is up
        return round(x, 1), round(y, 1)

    return proj


def _first_ring(coords) -> list:  # noqa: ANN001
    """Descend Polygon / MultiPolygon coordinates to the first linear ring of [lon,lat]."""
    node = coords
    num = (int, float)
    for _ in range(4):
        if isinstance(node, list) and node and isinstance(node[0], num):
            return []  # hit a bare number — malformed
        if (
            isinstance(node, list) and node and isinstance(node[0], list)
            and node[0] and isinstance(node[0][0], num)
        ):
            return node
        if isinstance(node, list) and node:
            node = node[0]
        else:
            return []
    return []


def situation_map_svg(detection, hindcast, forecast, env, *, w: int = 660, h: int = 380) -> str:  # noqa: ANN001
    """Slick + origin + drift centroid tracks + coastal receptors, framed on the incident."""
    poly_pts = [(float(c[0]), float(c[1])) for c in _first_ring(detection.geometry.polygon.coordinates)]
    bb = detection.geometry.bbox
    slick_box = [(bb.west, bb.south), (bb.east, bb.south), (bb.east, bb.north), (bb.west, bb.north)]
    o = hindcast.origin.point

    tracks: list[list[tuple[float, float]]] = []
    for sc in forecast.scenarios:
        for f in sc.track.features:
            if f.geometry.type == "LineString":
                tracks.append([(float(c[0]), float(c[1])) for c in f.geometry.coordinates])
    coasts: list[list[tuple[float, float]]] = []
    for r in env.receptors:
        for f in r.geometry.features:
            if f.geometry.type == "LineString":
                coasts.append([(float(c[0]), float(c[1])) for c in f.geometry.coordinates])

    # frame on the *incident* (slick + origin + drift), not distant coastlines
    core: list[tuple[float, float]] = list(poly_pts) + list(slick_box) + [(o.lon, o.lat)]
    for t in tracks:
        core += t
    if not core:
        return ""
    minx, miny, maxx, maxy = _bounds(core)
    mx = (maxx - minx) * 0.12 + 0.02
    my = (maxy - miny) * 0.12 + 0.02
    frame = [(minx - mx, miny - my), (maxx + mx, maxy + my)]
    proj = _projector(frame, w, h, pad=16)

    def path_d(line: list[tuple[float, float]], close: bool = False) -> str:
        d = " ".join(f"{'M' if i == 0 else 'L'}{proj(x, y)[0]},{proj(x, y)[1]}" for i, (x, y) in enumerate(line))
        return d + (" Z" if close else "")

    parts = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
             f'style="width:100%;height:auto;background:#dbe7ef;border:1px solid #c7cdbd;border-radius:8px">']

    for line in coasts:
        parts.append(f'<path d="{path_d(line)}" fill="none" stroke="#b98a4b" stroke-width="3" stroke-linecap="round"/>')

    colours = {"nominal": "#d56a55", "wind-driven": "#e0a34a", "current-dominated": "#6f9e6f"}
    for sc, line in zip(forecast.scenarios, tracks, strict=False):
        col = colours.get(sc.id, "#8aa1ad")
        parts.append(f'<path d="{path_d(line)}" fill="none" stroke="{col}" stroke-width="2" stroke-dasharray="5 3"/>')
        if line:
            ex, ey = proj(*line[-1])
            parts.append(f'<circle cx="{ex}" cy="{ey}" r="3.5" fill="{col}"/>')

    slick = poly_pts if len(poly_pts) >= 3 else slick_box
    parts.append(
        f'<path d="{path_d(slick, close=True)}" fill="#26201c" fill-opacity="0.6" '
        f'stroke="#26201c" stroke-width="1"/>'
    )

    ox, oy = proj(o.lon, o.lat)
    parts.append(f'<circle cx="{ox}" cy="{oy}" r="7" fill="none" stroke="#e0a34a" stroke-width="2"/>')
    parts.append(f'<circle cx="{ox}" cy="{oy}" r="2" fill="#e0a34a"/>')
    # label the amber dot directly, with a short leader line, so it is never a
    # mystery marker
    lx = min(w - 130, ox + 12)
    ly = max(14, oy - 10)
    parts.append(f'<line x1="{ox}" y1="{oy}" x2="{lx}" y2="{ly}" stroke="#e0a34a" stroke-width="1"/>')
    parts.append(
        f'<text x="{lx + 3}" y="{ly + 3}" font-size="10" font-weight="700" fill="#8a5a10" '
        f'font-family="sans-serif">Estimated spill origin</text>'
    )

    parts.append(
        f'<text x="12" y="{h - 12}" font-size="10" fill="#33434d" font-family="sans-serif">'
        'Amber dot = where the spill most likely started · dark shape = the detected slick · '
        'dashed lines = drift forecast · tan lines = coast at risk'
        '</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def area_growth_svg(area_by_hour: dict[str, float], *, w: int = 660, h: int = 220) -> str:
    items = sorted(((int(k), v) for k, v in area_by_hour.items()), key=lambda kv: kv[0])
    if len(items) < 2:
        return ""
    pad_l, pad_b, pad_t, pad_r = 44, 28, 16, 12
    vmax = max(v for _, v in items) or 1.0
    n = len(items)
    bw = (w - pad_l - pad_r) / n * 0.62
    gap = (w - pad_l - pad_r) / n
    parts = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
             f'style="width:100%;height:auto;background:#fff;border:1px solid #e8dfcf;border-radius:8px">']
    # y gridlines
    for frac in (0.0, 0.5, 1.0):
        gy = pad_t + (1 - frac) * (h - pad_t - pad_b)
        parts.append(
            f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{w - pad_r}" y2="{gy:.1f}" '
            f'stroke="#eee" stroke-width="1"/>'
        )
        parts.append(f'<text x="{pad_l - 6}" y="{gy + 3:.1f}" font-size="9" text-anchor="end" '
                     f'fill="#78868f" font-family="sans-serif">{frac * vmax:.0f}</text>')
    for i, (hr, v) in enumerate(items):
        bh = (v / vmax) * (h - pad_t - pad_b)
        x = pad_l + i * gap + (gap - bw) / 2
        y = h - pad_b - bh
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="#1f7a6b" rx="1.5"/>')
        parts.append(f'<text x="{x + bw / 2:.1f}" y="{h - pad_b + 12:.1f}" font-size="9" text-anchor="middle" '
                     f'fill="#4a5c68" font-family="sans-serif">{hr}h</text>')
    parts.append(f'<text x="{pad_l}" y="11" font-size="10" fill="#33434d" font-family="sans-serif">'
                 'Projected slick extent (km²) by forecast hour</text>')
    parts.append("</svg>")
    return "".join(parts)


def vessel_route_svg(card, *, w: int = 660, h: int = 300) -> str:  # noqa: ANN001
    """Lead suspect's reconstructed track with entry / closest / exit markers."""
    line: list[tuple[float, float]] = []
    closest: tuple[float, float] | None = None
    for f in card.track.features:
        if f.geometry.type == "LineString" and not line:
            line = [(float(c[0]), float(c[1])) for c in f.geometry.coordinates]
        if f.geometry.type == "Point" and f.properties.get("role") == "closest":
            c = f.geometry.coordinates
            closest = (float(c[0]), float(c[1]))
    if len(line) < 2:
        return ""
    allpts = list(line) + ([closest] if closest else [])
    proj = _projector(allpts, w, h)
    d = " ".join(f"{'M' if i == 0 else 'L'}{proj(x, y)[0]},{proj(x, y)[1]}" for i, (x, y) in enumerate(line))
    parts = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
             f'style="width:100%;height:auto;background:#dbe7ef;border:1px solid #c7cdbd;border-radius:8px">']
    parts.append(f'<path d="{d}" fill="none" stroke="#33566b" stroke-width="2"/>')
    sx, sy = proj(*line[0])
    ex, ey = proj(*line[-1])
    parts.append(f'<circle cx="{sx}" cy="{sy}" r="4" fill="#6f9e6f"/><text x="{sx + 6}" y="{sy + 3}" '
                 f'font-size="9" fill="#33434d" font-family="sans-serif">enter</text>')
    parts.append(f'<circle cx="{ex}" cy="{ey}" r="4" fill="#d56a55"/><text x="{ex + 6}" y="{ey + 3}" '
                 f'font-size="9" fill="#33434d" font-family="sans-serif">exit / last known</text>')
    if closest:
        cx, cy = proj(*closest)
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="none" stroke="#e0a34a" stroke-width="2"/>'
                     f'<text x="{cx + 7}" y="{cy + 3}" font-size="9" fill="#33434d" '
                     f'font-family="sans-serif">closest approach to origin</text>')
    nm = escape(card.vessel.name or f"MMSI {card.vessel.mmsi}")
    parts.append(f'<text x="12" y="16" font-size="10" fill="#33434d" font-family="sans-serif">'
                 f'{nm}: reconstructed AIS route</text>')
    parts.append("</svg>")
    return "".join(parts)
