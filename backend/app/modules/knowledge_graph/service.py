"""Maritime Knowledge Graph (advanced feature 10).

Assembles a single relationship graph from a completed investigation —
spill ↔ origin ↔ vessel ↔ company ↔ cargo ↔ weather ↔ evidence ↔ cause ↔ receptors ↔
precedent — so every finding is one click from its supporting context.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.logging import get_logger
from app.modules.cause_classification import classify
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.modules.risk_index.service import service as risk_service
from app.modules.similarity.service import service as similarity_service
from app.providers.registry import registry
from app.schemas.knowledge_graph import GraphEdge, GraphNode, KnowledgeGraph

log = get_logger(__name__)


class KnowledgeGraphError(RuntimeError):
    pass


class KnowledgeGraphService:
    async def build(self, detection_id: str) -> KnowledgeGraph:
        det = detection_service.get(detection_id)
        hc = ocean_service.get_hindcast(detection_id)
        ranking = investigation_service.get(detection_id)
        if det is None or hc is None or ranking is None:
            raise KnowledgeGraphError(
                "need a completed detection + hindcast + investigation for the graph"
            )

        sim = similarity_service.get(detection_id)
        if sim is None:
            try:
                sim = await similarity_service.search(detection_id)
            except Exception:  # noqa: BLE001
                sim = None

        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        seen: set[str] = set()

        def add_node(n: GraphNode) -> str:
            if n.id not in seen:
                nodes.append(n)
                seen.add(n.id)
            return n.id

        def add_edge(src: str, dst: str, kind: str, label: str = "") -> None:
            edges.append(GraphEdge(id=f"{src}->{dst}:{kind}", source=src, target=dst,
                                   kind=kind, label=label))

        # ---- centre: the spill --------------------------------------
        g, c = det.geometry, det.characterisation
        add_node(GraphNode(
            id="spill", kind="spill", group="spill", ring=0, label="Oil slick",
            sublabel=f"{g.area_km2:.0f} km² · {c.oil_type}",
            score=det.detection_confidence.score,
            detail={"Area": f"{g.area_km2:.1f} km²", "Volume":
                    f"{c.estimated_volume_bbl_low:,.0f} to {c.estimated_volume_bbl_high:,.0f} bbl",
                    "Film": c.thickness_class, "Detected": f"{det.detected_at:%Y-%m-%d %H:%MZ}",
                    "Confidence": f"{det.detection_confidence.score * 100:.0f}%"},
        ))

        # ---- ring 1: origin, drift, cause, incident ---------------
        o = hc.origin
        add_node(GraphNode(
            id="origin", kind="origin", group="origin", ring=1, label="Estimated origin",
            sublabel=f"{o.point.lat:.3f}, {o.point.lon:.3f}", score=o.confidence.score,
            detail={"Position": f"{o.point.lat:.4f}, {o.point.lon:.4f}",
                    "Release window":
                    f"{o.release_window.start:%d %b %H:%MZ} to {o.release_window.end:%d %b %H:%MZ}",
                    "Method": o.method, "Confidence": f"{o.confidence.score * 100:.0f}%"},
        ))
        add_edge("spill", "origin", "reconstructed_to", "reconstructed to")

        fc = ocean_service.get_forecast(detection_id)
        drift_detail = {"Method": o.method}
        if fc:
            drift_detail["Scenarios"] = str(len(fc.scenarios))
            drift_detail["Horizon"] = f"{fc.horizon_hours:.0f} h"
        add_node(GraphNode(id="weather", kind="weather", group="environment", ring=1,
                           label="Drift regime", sublabel="currents + monsoon wind",
                           detail=drift_detail))
        add_edge("weather", "spill", "drives", "drives drift")
        add_edge("weather", "origin", "constrains", "constrains hindcast")

        cause = classify(det, hc, ranking, sim)
        add_node(GraphNode(
            id="cause", kind="cause", group="cause", ring=1,
            label=cause.cause.replace("-", " ").title(),
            sublabel=f"{cause.probability * 100:.0f}% likely", score=cause.probability,
            detail={"Probability": f"{cause.probability * 100:.0f}%",
                    **{f"Alt: {k.replace('-', ' ')}": f"{v * 100:.0f}%"
                       for k, v in cause.alternatives.items()}},
        ))
        add_edge("spill", "cause", "classified_as", "classified as")

        incident = None
        if det.incident_id:
            try:
                incident = await registry.active("incidents").get(det.incident_id)  # type: ignore[attr-defined]
            except Exception:  # noqa: BLE001
                incident = None
        if incident is not None:
            add_node(GraphNode(
                id="incident", kind="incident", group="incident", ring=1,
                label=incident.name, sublabel=f"{incident.source} · {incident.severity}",
                detail={"Reported": f"{incident.reported_at:%Y-%m-%d}",
                        "Severity": incident.severity,
                        "Substance": incident.substance or "n/a"},
            ))
            add_edge("spill", "incident", "corresponds_to", "ground-truth record")

        # ---- ring 2/3: vessels + their attributes ----------------
        for card in ranking.cards[:3]:
            v = card.vessel
            vid = f"vessel:{v.mmsi}"
            add_node(GraphNode(
                id=vid, kind="vessel", group="vessel", ring=2,
                label=v.name or f"MMSI {v.mmsi}",
                sublabel=f"{v.vessel_type} · {card.suspicion_score * 100:.0f}% suspicion",
                score=card.suspicion_score,
                detail={"MMSI": v.mmsi, "IMO": v.imo or "n/a", "Type": v.vessel_type,
                        "Closest approach":
                        f"{card.closest_approach_km:.1f} km" if card.closest_approach_km else "n/a",
                        "Suspicion": f"{card.suspicion_score * 100:.0f}%"},
            ))
            add_edge("origin", vid, "vessel_present", "vessel present")

            if v.owner or v.operator_company:
                comp = v.operator_company or v.owner or "Unknown operator"
                cid = f"company:{comp}"
                add_node(GraphNode(id=cid, kind="company", group="company", ring=3,
                                   label=comp,
                                   sublabel=(f"owner: {v.owner}" if v.owner and v.owner != comp else ""),
                                   detail={"Owner": v.owner or "n/a",
                                           "Operator": v.operator_company or "n/a",
                                           "Home port": v.home_port or "n/a"}))
                add_edge(vid, cid, "operated_by", "operated by")
            if v.cargo_declared:
                gid = f"cargo:{v.cargo_declared}"
                add_node(GraphNode(id=gid, kind="cargo", group="cargo", ring=3,
                                   label=v.cargo_declared, detail={"Declared cargo": v.cargo_declared}))
                add_edge(vid, gid, "carrying", "carrying")
            if v.flag_state:
                fid = f"flag:{v.flag_state}"
                add_node(GraphNode(id=fid, kind="flag", group="flag", ring=3,
                                   label=v.flag_state, sublabel="flag state",
                                   detail={"Flag state": v.flag_state}))
                add_edge(vid, fid, "flagged", "flagged")

        # lead suspect: evidence + risk
        lead = ranking.cards[0] if ranking.cards else None
        if lead:
            lid = f"vessel:{lead.vessel.mmsi}"
            for i, fct in enumerate(
                [f for f in lead.factors if f.polarity == "incriminating"][:4]
            ):
                eid = f"evidence:{lead.vessel.mmsi}:{i}"
                add_node(GraphNode(id=eid, kind="evidence", group="evidence", ring=3,
                                   label=fct.kind.replace("_", " ").title(),
                                   sublabel=fct.summary[:60],
                                   score=fct.weight, detail={"Weight": f"{fct.weight:.2f}",
                                                             "Detail": fct.summary}))
                add_edge(lid, eid, "exhibited", "exhibited")
                add_edge(eid, "spill", "supports", "supports attribution")

            try:
                risk = await risk_service.profile(lead.vessel.mmsi)
            except Exception:  # noqa: BLE001
                risk = None
            if risk is not None:
                add_node(GraphNode(id="risk", kind="risk", group="risk", ring=3,
                                   label=f"Risk: {risk.tier}",
                                   sublabel=f"{risk.risk_score * 100:.0f}% · {risk.micro_leak_count} micro-leaks",
                                   score=risk.risk_score,
                                   detail={"Tier": risk.tier,
                                           "Score": f"{risk.risk_score * 100:.0f}%",
                                           "Recurring": "yes" if risk.recurring_pollution else "no"}))
                add_edge(lid, "risk", "risk_profile", "risk profile")

        # ---- ring 2: receptors + precedent ----------------------
        env = environmental_service.get(detection_id)
        if env:
            for r in [t for t in env.receptors if t.likelihood > 0][:3]:
                rid = f"receptor:{r.receptor_id}"
                add_node(GraphNode(id=rid, kind="receptor", group="environment", ring=2,
                                   label=r.name, sublabel=f"{r.kind} · {r.likelihood * 100:.0f}%",
                                   score=r.likelihood,
                                   detail={"Kind": r.kind, "Distance": f"{r.distance_km:.0f} km",
                                           "Likelihood": f"{r.likelihood * 100:.0f}%",
                                           "ETA": f"{r.eta:%d %b %H:%MZ}" if r.eta else "n/a"}))
                add_edge("spill", rid, "threatens", "threatens")

        if sim and sim.cases:
            best = sim.cases[0]
            add_node(GraphNode(id="precedent", kind="precedent", group="precedent", ring=2,
                               label=best.name, sublabel=f"{best.similarity_score * 100:.0f}% match · {best.date:%Y}",
                               score=best.similarity_score,
                               detail={"Match": f"{best.similarity_score * 100:.0f}%",
                                       "Cause": best.cause.replace("-", " "),
                                       "Outcome": best.outcome}))
            add_edge("spill", "precedent", "resembles", "resembles")
            add_edge("precedent", "cause", "supports_cause", "supports")

        log.info("knowledge graph %s: %d nodes, %d edges", detection_id, len(nodes), len(edges))
        return KnowledgeGraph(
            detection_id=detection_id, generated_at=datetime.now(UTC),
            nodes=nodes, edges=edges,
        )


service = KnowledgeGraphService()
