"""Assemble an Explainable Evidence Card from metrics, factors and the score."""

from __future__ import annotations

from app.modules.investigation.types import BehaviourMetrics
from app.schemas.ais import VesselTrack
from app.schemas.common import Confidence, GeoJSONFeature, GeoJSONFeatureCollection
from app.schemas.investigation import EvidenceCard, EvidenceFactor


def build_card(
    track: VesselTrack,
    metrics: BehaviourMetrics,
    factors: list[EvidenceFactor],
    suspicion: float,
    rank: int,
) -> EvidenceCard:
    return EvidenceCard(
        vessel=track.vessel,
        suspicion_score=suspicion,
        rank=rank,
        closest_approach_km=metrics.closest_km,
        closest_approach_at=metrics.closest_at,
        track=_track_fc(track, metrics),
        factors=sorted(factors, key=lambda f: (f.polarity != "incriminating", -f.weight)),
        narrative=_narrative(track, metrics, factors, suspicion),
        confidence=_confidence(metrics),
    )


def _track_fc(track: VesselTrack, m: BehaviourMetrics) -> GeoJSONFeatureCollection:
    pts = sorted(track.positions, key=lambda p: p.time)
    line = [[p.position.lon, p.position.lat] for p in pts]
    feats: list[GeoJSONFeature] = [
        GeoJSONFeature(
            geometry={"type": "LineString", "coordinates": line},  # type: ignore[arg-type]
            properties={
                "role": "track", "mmsi": track.vessel.mmsi, "name": track.vessel.name,
                # timestamps aligned to the LineString vertices — powers the
                # reconstruction player's vessel animation
                "times": [p.time.isoformat() for p in pts],
                "sog": [p.sog_kn for p in pts],
            },
        )
    ]
    # dashed connector across each AIS gap
    for a, b in track.gap_intervals:
        before = [p for p in pts if p.time <= a]
        after = [p for p in pts if p.time >= b]
        if before and after:
            feats.append(GeoJSONFeature(
                geometry={  # type: ignore[arg-type]
                    "type": "LineString",
                    "coordinates": [
                        [before[-1].position.lon, before[-1].position.lat],
                        [after[0].position.lon, after[0].position.lat],
                    ],
                },
                properties={"role": "gap", "minutes": round((b - a).total_seconds() / 60)},
            ))
    if m.closest_at is not None:
        cp = min(pts, key=lambda p: abs((p.time - m.closest_at).total_seconds()))
        feats.append(GeoJSONFeature(
            geometry={"type": "Point", "coordinates": [cp.position.lon, cp.position.lat]},  # type: ignore[arg-type]
            properties={"role": "closest", "km": m.closest_km},
        ))
    return GeoJSONFeatureCollection(features=feats)


def _narrative(
    track: VesselTrack, m: BehaviourMetrics, factors: list[EvidenceFactor], suspicion: float
) -> str:
    name = track.vessel.name or f"MMSI {track.vessel.mmsi}"
    inc = [f.summary.lower() for f in factors if f.polarity == "incriminating"]
    mit = [f.summary.lower() for f in factors if f.polarity == "mitigating"]
    if suspicion >= 0.6 and inc:
        head = f"{name} is the leading suspect: " + "; ".join(inc[:3]) + "."
    elif inc:
        head = f"{name} shows some concerning behaviour ({inc[0]}) but not a strong case."
    else:
        head = f"{name} transited the area with no anomalies of note."
    if mit:
        head += f" Mitigating: {mit[0]}."
    return head


def _confidence(m: BehaviourMetrics) -> Confidence:
    base = 0.5 + min(m.n_positions, 80) / 260.0
    if m.gap_minutes > 0:
        base -= 0.12  # a gap means part of the track is inferred
    if m.duration_h < 2:
        base -= 0.1
    score = round(max(0.3, min(0.9, base)), 3)
    return Confidence(
        score=score,
        rationale=(f"{m.n_positions} positions over {m.duration_h:.1f} h"
                   + (f", {m.gap_minutes:.0f} min gap" if m.gap_minutes else "")),
    )
