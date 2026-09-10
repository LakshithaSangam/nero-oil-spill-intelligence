"""Specialised agents — each wraps exactly one pipeline stage.

Agents are deterministic coordinators: they call a module service, thread the result
id through ``ctx.scratch`` for downstream agents, and return an ``AgentResult`` with a
human-readable rationale for the activity feed. An LLM reasoning layer could sit
behind the same ``run()`` signature without touching the orchestrator.
"""

from __future__ import annotations

from app.agents.base import AgentContext, AgentPhase, AgentResult
from app.fixtures.scenarios import get_scenario
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.schemas.detection import DetectionRequest
from app.schemas.investigation import InvestigationRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest
from app.schemas.report import ReportRequest
from app.services.report_generator import service as report_service


def _did(ctx: AgentContext) -> str:
    did = ctx.scratch.get("satellite_ref")
    if not did:
        raise RuntimeError("no detection id in context; SatelliteAgent must run first")
    return str(did)


class SatelliteAgent:
    phase = AgentPhase.SATELLITE

    async def run(self, ctx: AgentContext) -> AgentResult:
        scenario = get_scenario(ctx.scenario)
        detection = await detection_service.run(DetectionRequest(
            bbox=scenario.aoi, scenario=scenario.id,
            incident_id=ctx.incident_id or scenario.incident.id,
        ))
        g, c = detection.geometry, detection.characterisation
        return AgentResult(
            phase=self.phase, ok=True, output_ref=detection.id,
            rationale=(
                f"Detected a {g.area_km2:.1f} km² slick ({g.fragment_count} fragments, "
                f"{g.slick_length_km:.0f} km long), {c.oil_type} / {c.thickness_class}, "
                f"~{c.estimated_volume_bbl_low:,.0f} to {c.estimated_volume_bbl_high:,.0f} bbl. "
                f"Detection confidence {detection.detection_confidence.score * 100:.0f}%"
                f"{' with EO confirmation' if detection.eo_validated else ' (SAR-only)'}."
            ),
            data={
                "detection_id": detection.id,
                "area_km2": g.area_km2,
                "confidence": detection.detection_confidence.score,
                "oil_type": c.oil_type,
            },
        )


class OceanAgent:
    phase = AgentPhase.OCEAN

    async def run(self, ctx: AgentContext) -> AgentResult:
        did = _did(ctx)
        hc = await ocean_service.hindcast(DriftAnalysisRequest(detection_id=did))
        fc = await ocean_service.forecast(DriftAnalysisRequest(detection_id=did, horizon_hours=72))
        o = hc.origin
        reached = [c for c in fc.affected_coasts if c.eta is not None]
        coast = (f"; earliest landfall {reached[0].name} (~{reached[0].likelihood * 100:.0f}%)"
                 if reached else "; no landfall within 72 h")
        return AgentResult(
            phase=self.phase, ok=True, output_ref=did,
            rationale=(
                f"Origin reconstructed near {o.point.lat:.3f}, {o.point.lon:.3f} "
                f"({o.confidence.score * 100:.0f}% confidence), released "
                f"{o.release_window.start:%d %b %H:%MZ} to {o.release_window.end:%d %b %H:%MZ}. "
                f"Forecast: {len(fc.scenarios)} drift scenarios over 72 h{coast}."
            ),
            data={
                "origin": [o.point.lon, o.point.lat],
                "release_window": [o.release_window.start.isoformat(),
                                   o.release_window.end.isoformat()],
                "coasts_reached": len(reached),
            },
        )


class VesselAgent:
    phase = AgentPhase.VESSEL

    async def run(self, ctx: AgentContext) -> AgentResult:
        did = _did(ctx)
        ranking = await investigation_service.run(InvestigationRequest(detection_id=did))
        lead = ranking.cards[0] if ranking.cards else None
        gaps = sum(1 for c in ranking.cards
                   if any(f.kind == "ais_gap" for f in c.factors))
        return AgentResult(
            phase=self.phase, ok=True, output_ref=did,
            rationale=(
                f"Reconstructed {ranking.candidates_considered} vessels for the release "
                f"window; {gaps} with an AIS gap. "
                + (f"Closest: {lead.vessel.name} at {lead.closest_approach_km:.1f} km."
                   if lead else "No vessels in range.")
            ),
            data={"candidates": ranking.candidates_considered,
                  "lead_mmsi": lead.vessel.mmsi if lead else None},
        )


class InvestigationAgent:
    phase = AgentPhase.INVESTIGATION

    async def run(self, ctx: AgentContext) -> AgentResult:
        did = _did(ctx)
        ranking = investigation_service.get(did)
        if ranking is None or not ranking.cards:
            return AgentResult(phase=self.phase, ok=False,
                               rationale="No suspect ranking available to consolidate.")
        lead = ranking.cards[0]
        runner = ranking.cards[1] if len(ranking.cards) > 1 else None
        margin = lead.suspicion_score - (runner.suspicion_score if runner else 0.0)
        strength = ("strong" if lead.suspicion_score >= 0.75 and margin >= 0.3
                    else "tentative" if lead.suspicion_score >= 0.5
                    else "inconclusive")
        key = ", ".join(sorted({f.kind.replace("_", " ") for f in lead.factors
                                if f.polarity == "incriminating"})[:4])
        return AgentResult(
            phase=self.phase, ok=True, output_ref=did,
            rationale=(
                f"Attribution is **{strength}**: {lead.vessel.name} at "
                f"{lead.suspicion_score * 100:.0f}% "
                f"(+{margin * 100:.0f} pts over the next vessel). Key evidence: {key}."
            ),
            data={"lead_mmsi": lead.vessel.mmsi, "score": lead.suspicion_score,
                  "margin": round(margin, 3), "strength": strength},
        )


class EnvironmentalAgent:
    phase = AgentPhase.ENVIRONMENTAL

    async def run(self, ctx: AgentContext) -> AgentResult:
        did = _did(ctx)
        impact = await environmental_service.assess(did)
        reached = [r for r in impact.receptors if r.eta is not None]
        return AgentResult(
            phase=self.phase, ok=True, output_ref=did,
            rationale=(
                f"Environmental priority {impact.priority_score * 100:.0f}%. "
                + (f"Shoreline contact at {reached[0].name} "
                   f"({reached[0].likelihood * 100:.0f}%). "
                   if reached else "No shoreline contact projected. ")
                + f"Cleanup cost US${impact.estimated_cleanup_cost_usd_low / 1e6:.1f}M to "
                  f"US${impact.estimated_cleanup_cost_usd_high / 1e6:.0f}M."
            ),
            data={"priority": impact.priority_score,
                  "receptors_reached": len(reached)},
        )


class ReportAgent:
    phase = AgentPhase.REPORT

    async def run(self, ctx: AgentContext) -> AgentResult:
        did = _did(ctx)
        report = await report_service.generate(ReportRequest(
            detection_id=did, investigation_id=ctx.investigation_id,
        ))
        ctx.scratch["report_ref"] = report.id
        return AgentResult(
            phase=self.phase, ok=True, output_ref=report.id,
            rationale=(
                f"Report {report.id} compiled. Most probable cause: "
                f"**{report.cause.cause.replace('-', ' ')}** "
                f"({report.cause.probability * 100:.0f}%). "
                f"Lead suspect MMSI {report.lead_suspect_mmsi}."
            ),
            data={"report_id": report.id, "cause": report.cause.cause,
                  "cause_probability": report.cause.probability},
        )


ALL_AGENTS = [
    SatelliteAgent(), OceanAgent(), VesselAgent(),
    InvestigationAgent(), EnvironmentalAgent(), ReportAgent(),
]
