"""Investigation Report Generator (milestone M5).

Assembles the outputs of every module into a single ``InvestigationReport``:
detection + hindcast + forecast + suspect ranking + environmental impact + a cause
assessment → executive summary + per-section markdown, plus a standalone HTML render.
It orchestrates; it does not analyse.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from html import escape

from app.core.logging import get_logger
from app.fixtures.scenarios import SCENARIOS
from app.modules.cause_classification import classify
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.modules.similarity.service import service as similarity_service
from app.schemas.report import (
    CauseAssessment,
    InvestigationReport,
    ReportRequest,
    ReportSection,
)
from app.services.report_visuals import (
    area_growth_svg,
    biodiversity_risk,
    cleanup_urgency,
    operator_class,
    situation_map_svg,
    vessel_route_svg,
)

log = get_logger(__name__)


class ReportError(RuntimeError):
    pass


class ReportService:
    def __init__(self) -> None:
        self._store: dict[str, InvestigationReport] = {}

    async def generate(self, request: ReportRequest) -> InvestigationReport:
        did = request.detection_id
        detection = detection_service.get(did)
        hindcast = ocean_service.get_hindcast(did)
        forecast = ocean_service.get_forecast(did)
        suspects = investigation_service.get(did)
        missing = [n for n, v in (
            ("detection (M1)", detection), ("hindcast (M2)", hindcast),
            ("forecast (M2)", forecast), ("investigation (M3)", suspects),
        ) if v is None]
        if missing:
            raise ReportError("run these first: " + ", ".join(missing))
        assert detection and hindcast and forecast and suspects  # narrow types

        environmental = environmental_service.get(did)
        if environmental is None:
            environmental = await environmental_service.assess(did)

        similar = similarity_service.get(did)
        if similar is None:
            try:
                similar = await similarity_service.search(did)
            except Exception:  # noqa: BLE001
                similar = None
        cause = classify(detection, hindcast, suspects, similar)
        scenario = next(
            (s for s in SCENARIOS.values() if s.incident.id == detection.incident_id), None
        )
        lead = suspects.cards[0] if suspects.cards else None
        now = datetime.now(UTC)
        report_id = "rep-" + hashlib.sha1(f"{did}:{now.isoformat()}".encode()).hexdigest()[:10]

        exec_summary = _executive_summary(detection, hindcast, forecast, lead, cause, environmental)
        sections = _sections(detection, hindcast, forecast, suspects, environmental, cause)

        report = InvestigationReport(
            id=report_id,
            detection_id=did,
            investigation_id=request.investigation_id,
            incident_id=detection.incident_id,
            generated_at=now,
            title=(f"Oil Spill Investigation: "
                   f"{scenario.name if scenario else 'Marine pollution event'}, "
                   f"{detection.detected_at:%Y-%m-%d}"),
            executive_summary=exec_summary,
            cause=cause,
            lead_suspect_mmsi=lead.vessel.mmsi if lead else None,
            detection=detection,
            hindcast=hindcast,
            forecast=forecast,
            suspects=suspects,
            environmental=environmental,
            sections=sections,
        )
        self._store[report_id] = report
        log.info("report %s generated for detection %s", report_id, did)
        return report

    def get(self, report_id: str) -> InvestigationReport | None:
        return self._store.get(report_id)

    def render_html(self, report: InvestigationReport) -> str:
        return _html_document(report)


# --------------------------------------------------------------------------- #
def _fmt_usd(n: float) -> str:
    if n >= 1e9:
        return f"US${n / 1e9:.1f} B"
    if n >= 1e6:
        return f"US${n / 1e6:.1f} M"
    return f"US${n / 1e3:,.0f} k"


def _executive_summary(detection, hindcast, forecast, lead, cause: CauseAssessment, env) -> str:
    g = detection.geometry
    o = hindcast.origin
    reached = [c for c in forecast.affected_coasts if c.eta is not None]
    suspect = (f"The leading suspect is **{lead.vessel.name}** (MMSI {lead.vessel.mmsi}, "
               f"{lead.vessel.vessel_type}, {lead.vessel.flag_state}) with a suspicion score "
               f"of {lead.suspicion_score * 100:.0f}%."
               if lead else "No vessel could be attributed with confidence.")
    coast = (f" Shoreline contact is projected at {reached[0].name} "
             f"(~{int(reached[0].likelihood * 100)}% of drift scenarios)."
             if reached else " No shoreline contact is projected within the forecast horizon.")
    return (
        f"A {g.area_km2:.1f} km² oil slick was detected by Sentinel-1 SAR on "
        f"{detection.detected_at:%d %b %Y %H:%MZ}, with EO "
        f"{'confirmation' if detection.eo_validated else 'radar only'} and a detection "
        f"confidence of {detection.detection_confidence.score * 100:.0f}%. Reverse drift "
        f"modelling places the origin near {o.point.lat:.3f}, {o.point.lon:.3f} "
        f"({o.confidence.score * 100:.0f}% confidence), released between "
        f"{o.release_window.start:%d %b %H:%MZ} and {o.release_window.end:%d %b %H:%MZ}. "
        f"{suspect}{coast} The most probable cause is "
        f"**{cause.cause.replace('-', ' ')}** ({cause.probability * 100:.0f}%). "
        f"Environmental priority is assessed at {env.priority_score * 100:.0f}%, with "
        f"cleanup cost estimated at {_fmt_usd(env.estimated_cleanup_cost_usd_low)} to "
        f"{_fmt_usd(env.estimated_cleanup_cost_usd_high)}."
    )


def _sections(detection, hindcast, forecast, suspects, env, cause) -> list[ReportSection]:
    g, c = detection.geometry, detection.characterisation
    o = hindcast.origin

    detect_md = "\n".join([
        f"- **Area / perimeter:** {g.area_km2:.1f} km² / {g.perimeter_km:.1f} km",
        f"- **Slick length:** {g.slick_length_km:.1f} km across {g.fragment_count} fragment(s)",
        f"- **Estimated volume:** {c.estimated_volume_bbl_low:,.0f} to {c.estimated_volume_bbl_high:,.0f} bbl "
        f"({c.thickness_class} film)",
        f"- **Oil type:** {c.oil_type} ({c.oil_type_confidence.score * 100:.0f}%, "
        f"{c.oil_type_confidence.rationale})",
        f"- **Spill age:** {c.spill_age_hours_low:.0f} to {c.spill_age_hours_high:.0f} h at detection",
        f"- **Detection confidence:** {detection.detection_confidence.score * 100:.0f}%. "
        f"{detection.detection_confidence.rationale}",
        "",
        "False positive screening:",
        *[f"  - {chk}" for chk in detection.false_positive_checks],
    ])

    origin_md = "\n".join([
        f"- **Estimated origin:** {o.point.lat:.4f}, {o.point.lon:.4f}",
        f"- **Release window:** {o.release_window.start:%d %b %Y %H:%MZ} to "
        f"{o.release_window.end:%d %b %Y %H:%MZ}",
        f"- **Method:** {o.method}",
        f"- **Confidence:** {o.confidence.score * 100:.0f}%. {o.confidence.rationale}",
    ])

    fc_rows = "\n".join(
        f"- **{s.label}** ({s.probability * 100:.0f}%): {s.forcing_note}"
        for s in forecast.scenarios
    )
    coast_rows = "\n".join(
        (f"- **{cst.name}**: ETA {cst.eta:%d %b %H:%MZ}, {cst.likelihood * 100:.0f}% likelihood"
         if cst.eta else f"- **{cst.name}**: no landfall within the horizon")
        for cst in forecast.affected_coasts
    )
    spread_rows = "\n".join(
        f"- **+{h} h:** {v:.0f} km²"
        for h, v in sorted(
            forecast.expected_area_km2_by_hour.items(), key=lambda kv: int(kv[0])
        )
    )
    forcing_md = "\n".join(f"- {f}" for f in forecast.forcing_factors) or "- currents + wind + diffusion"
    forecast_md = (
        f"Forecast horizon: {forecast.horizon_hours:.0f} h. The drift is integrated from "
        f"a combined forcing field, not wind alone:\n{forcing_md}\n\n"
        f"**Drift ensemble**\n{fc_rows}\n\n"
        f"**Predicted spill spread**\n{spread_rows}\n\n"
        f"**Coastal exposure**\n{coast_rows}"
    )

    rank_rows = "\n".join(
        f"- **#{card.rank} {card.vessel.name}** ({card.vessel.vessel_type}, "
        f"{card.vessel.flag_state}): {card.suspicion_score * 100:.0f}%, "
        f"closest {card.closest_approach_km:.1f} km"
        for card in suspects.cards
    )
    lead = suspects.cards[0] if suspects.cards else None
    lead_md = ""
    if lead:
        factors = "\n".join(
            f"  - [{f.polarity}] {f.summary}" for f in lead.factors
        )
        owner_label, owner_basis = operator_class(lead.vessel)
        conf = lead.confidence
        lead_md = (
            f"\n\n**Lead suspect: {lead.vessel.name}**\n"
            f"{lead.narrative}\n\n"
            f"- **Suspicion score:** {lead.suspicion_score * 100:.0f}% "
            f"(next vessel {suspects.cards[1].suspicion_score * 100:.0f}%)\n"
            if len(suspects.cards) > 1 else
            f"- **Suspicion score:** {lead.suspicion_score * 100:.0f}%\n"
        )
        lead_md += (
            f"- **Investigation confidence:** {conf.score * 100:.0f}%. {conf.rationale}\n"
            f"- **MMSI / IMO:** {lead.vessel.mmsi} / {lead.vessel.imo or 'not on record'}\n"
            f"- **Type:** {lead.vessel.vessel_type} · Flag: {lead.vessel.flag_state or 'n/a'} · "
            f"Home port: {lead.vessel.home_port or 'n/a'}\n"
            f"- **Owner:** {lead.vessel.owner or 'n/a'} · **Operator:** {lead.vessel.operator_company or 'n/a'}\n"
            f"- **Ownership classification:** {owner_label}. {owner_basis}\n"
            f"- **Declared cargo:** {lead.vessel.cargo_declared or 'n/a'} · "
            f"Prior violations: {lead.vessel.prior_violations if lead.vessel.prior_violations is not None else 'n/a'}\n"
            f"- **Why this vessel ranks first:**\n{factors}"
        )
    attribution_md = (
        f"{suspects.candidates_considered} vessels were reconstructed from AIS for the "
        f"window {suspects.origin_window_used}, then scored on distance from the spill "
        f"origin, time overlap with the release window, route consistency, speed / course "
        f"behaviour, vessel category and prior history.\n\n{rank_rows}{lead_md}"
    )

    recep_rows = "\n".join(
        (f"- **{t.name}** ({t.kind}): {t.distance_km:.0f} km, "
         + (f"ETA {t.eta:%d %b %H:%MZ}, {t.likelihood * 100:.0f}% likelihood, "
            if t.eta else "no projected contact, ")
         + f"sensitivity {t.sensitivity * 100:.0f}%")
        for t in env.receptors
    )
    biod_band, biod_why = biodiversity_risk(env)
    urg_level, urg_score, urg_note = cleanup_urgency(env.priority_score, biod_band)
    env_md = "\n".join([
        f"- **Environmental priority score:** {env.priority_score * 100:.0f}%",
        f"- **Marine life in the spill area:** {env.marine_biodiversity} biodiversity. "
        f"{env.marine_life_note}",
        f"- **Marine biodiversity risk:** {biod_band}. {biod_why}",
        f"- **Cleanup urgency:** {urg_level} ({urg_score}/100). {urg_note}",
        f"- **Affected-area estimate:** {env.affected_area_km2_estimate:.0f} km²",
        f"- **Cleanup cost:** {_fmt_usd(env.estimated_cleanup_cost_usd_low)} to "
        f"{_fmt_usd(env.estimated_cleanup_cost_usd_high)}",
        f"- **Liability exposure:** {_fmt_usd(env.estimated_liability_usd_low)} to "
        f"{_fmt_usd(env.estimated_liability_usd_high)}",
        "",
        "**Receptors**",
        recep_rows,
        "",
        env.notes,
    ])

    alt_md = "\n".join(
        f"- {k.replace('-', ' ')}: {v * 100:.0f}%" for k, v in cause.alternatives.items()
    ) or "- none of note"
    cat_md = "\n".join(
        f"- {k}: {v * 100:.0f}%" for k, v in cause.category_confidence.items() if v >= 0.02
    ) or "- not resolved"
    cause_md = "\n".join([
        f"**Most probable cause: {cause.cause.replace('-', ' ')}** "
        f"({cause.probability * 100:.0f}%)",
        "",
        "How it most likely happened (confidence by category, from the SAR imagery "
        "and vessel behaviour):",
        cat_md,
        "",
        "Supporting evidence:",
        *[f"- {e}" for e in cause.supporting_evidence],
        "",
        "Alternative hypotheses:",
        alt_md,
    ])

    rec_md = "\n".join([
        "- Task a surface asset to the estimated origin and along the forecast drift axis "
        "for visual confirmation and sampling.",
        "- Serve a preservation notice on the lead suspect's AIS, ECDIS and oil record book; "
        "request bunker and slop-tank records for the release window.",
        "- Pre-position containment boom and mobilise coastal response toward the "
        "highest-likelihood receptor.",
        "- Re-task Sentinel-1 for the next pass to measure spill growth and validate the drift model.",
        "- Cross-check the lead suspect against the pollution risk index and prior-incident database.",
    ])

    return [
        ReportSection(key="detection", title="1 · Detection & characterisation", body_markdown=detect_md),
        ReportSection(key="origin", title="2 · Origin reconstruction", body_markdown=origin_md),
        ReportSection(key="forecast", title="3 · Drift forecast & coastal exposure", body_markdown=forecast_md),
        ReportSection(key="attribution", title="4 · Vessel attribution", body_markdown=attribution_md),
        ReportSection(key="environmental", title="5 · Environmental assessment", body_markdown=env_md),
        ReportSection(key="cause", title="6 · Cause assessment", body_markdown=cause_md),
        ReportSection(key="recommendations", title="7 · Recommended actions", body_markdown=rec_md),
    ]


# ---- minimal markdown -> HTML (headings, lists, bold, paragraphs) --------- #
def _md_to_html(md: str) -> str:
    out: list[str] = []
    in_list = False
    for raw in md.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            if in_list:
                out.append("</ul>")
                in_list = False
            continue
        html_line = escape(stripped)
        html_line = _bold(html_line)
        indent = len(line) - len(line.lstrip())
        if stripped.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f'<li style="margin-left:{indent}px">{_bold(escape(stripped[2:]))}</li>')
        elif stripped.startswith("## "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h4>{_bold(escape(stripped[3:]))}</h4>")
        else:
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<p>{html_line}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _bold(s: str) -> str:
    parts = s.split("**")
    return "".join(p if i % 2 == 0 else f"<strong>{p}</strong>" for i, p in enumerate(parts))


def _key_facts_table(report: InvestigationReport) -> str:
    d, h, f = report.detection, report.hindcast, report.forecast
    lead = report.suspects.cards[0] if report.suspects and report.suspects.cards else None
    o = h.origin
    reached = [c for c in f.affected_coasts if c.eta is not None]
    c = d.characterisation
    rows: list[tuple[str, str]] = [
        ("Spill location", f"{o.point.lat:.3f}, {o.point.lon:.3f} (estimated origin)"),
        ("Detected at", f"{d.detected_at:%d %b %Y %H:%M UTC}, Sentinel-1 SAR"),
        ("Release window", f"{o.release_window.start:%d %b %H:%MZ} to {o.release_window.end:%d %b %H:%MZ}"),
        ("Slick area", f"{d.geometry.area_km2:.1f} km² ({d.geometry.fragment_count} fragment(s))"),
        ("Estimated quantity", f"{c.estimated_volume_bbl_low:,.0f} to {c.estimated_volume_bbl_high:,.0f} bbl ({c.thickness_class} film)"),
        ("Predicted movement", (f"toward {reached[0].name} (~{int(reached[0].likelihood * 100)}%), "
                                f"ETA {reached[0].eta:%d %b %H:%MZ}" if reached else "no shoreline contact within horizon")),
    ]
    if lead:
        owner_label, _ = operator_class(lead.vessel)
        rows += [
            ("Suspected vessel", f"{lead.vessel.name or ('MMSI ' + lead.vessel.mmsi)} "
                                 f"({lead.vessel.vessel_type}, {lead.vessel.flag_state or 'flag n/a'})"),
            ("MMSI / IMO", f"{lead.vessel.mmsi} / {lead.vessel.imo or 'n/a'}"),
            ("Owner / operator", f"{lead.vessel.operator_company or lead.vessel.owner or 'n/a'}, {owner_label}"),
            ("Suspicion / confidence", f"{lead.suspicion_score * 100:.0f}% suspicion · {lead.confidence.score * 100:.0f}% confidence"),
        ]
    if report.environmental:
        env = report.environmental
        band, _ = biodiversity_risk(env)
        level, score, _ = cleanup_urgency(env.priority_score, band)
        rows += [
            ("Marine life in area",
             f"{env.marine_biodiversity} · ~{env.marine_life_affected_pct:.0f}% affected"),
            ("Marine biodiversity risk", band),
            ("Cleanup urgency", f"{level} ({score}/100)"),
        ]
    body = "".join(f"<tr><th>{escape(k)}</th><td>{escape(v)}</td></tr>" for k, v in rows)
    return f'<table class="facts">{body}</table>'


def _html_document(report: InvestigationReport) -> str:
    situation = area = route = ""
    if report.detection and report.hindcast and report.forecast and report.environmental:
        situation = situation_map_svg(
            report.detection, report.hindcast, report.forecast, report.environmental
        )
        area = area_growth_svg(report.forecast.expected_area_km2_by_hour)
    lead = report.suspects.cards[0] if report.suspects and report.suspects.cards else None
    if lead:
        route = vessel_route_svg(lead)

    figs = ""
    if situation:
        figs += f'<figure><figcaption>Figure 1: Situation map</figcaption>{situation}</figure>'
    if area:
        figs += f'<figure><figcaption>Figure 2: Predicted spill spread</figcaption>{area}</figure>'
    if route:
        figs += f'<figure><figcaption>Figure 3: Suspected vessel route</figcaption>{route}</figure>'

    sections_html = "\n".join(
        f'<section><h3>{escape(s.title)}</h3>{_md_to_html(s.body_markdown)}</section>'
        for s in report.sections
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{escape(report.title)}</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ font: 15px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; color: #0A1826;
    background: #F4F1EA; margin: 0; padding: 40px; }}
  main {{ max-width: 840px; margin: 0 auto; background: #fff; border: 1px solid #D6CDBC;
    border-radius: 14px; padding: 40px 44px; }}
  .eyebrow {{ letter-spacing: .18em; text-transform: uppercase; font-size: 11px;
    color: #1F7A6B; font-weight: 600; }}
  h1 {{ font-size: 22px; margin: 6px 0 2px; }}
  h2 {{ font-size: 13px; margin: 26px 0 8px; letter-spacing: .06em; text-transform: uppercase; color: #4A5C68; }}
  h3 {{ font-size: 15px; margin: 28px 0 6px; border-bottom: 1px solid #E8DFCF; padding-bottom: 4px; }}
  h4 {{ font-size: 13px; margin: 14px 0 4px; }}
  p {{ margin: 6px 0; }}
  ul {{ margin: 6px 0; padding-left: 20px; }}
  li {{ margin: 3px 0; }}
  .summary {{ background: #F4F1EA; border: 1px solid #E8DFCF; border-radius: 10px;
    padding: 14px 16px; margin: 14px 0 6px; }}
  .meta {{ color: #4A5C68; font-size: 12px; }}
  table.facts {{ border-collapse: collapse; width: 100%; margin: 12px 0 4px; font-size: 13px; }}
  table.facts th {{ text-align: left; width: 34%; padding: 6px 10px; background: #F4F1EA;
    border: 1px solid #E8DFCF; font-weight: 600; vertical-align: top; }}
  table.facts td {{ padding: 6px 10px; border: 1px solid #E8DFCF; }}
  figure {{ margin: 16px 0; }}
  figcaption {{ font-size: 11px; color: #4A5C68; margin-bottom: 4px; letter-spacing: .04em; }}
  .disclaimer {{ margin-top: 30px; font-size: 11px; color: #78868F;
    border-top: 1px solid #E8DFCF; padding-top: 12px; }}
  @media print {{ body {{ background: #fff; padding: 0; }} main {{ border: 0; max-width: none; }}
    figure, section {{ break-inside: avoid; }} }}
</style></head>
<body><main>
  <div class="eyebrow">Nero · Maritime Oil Spill Intelligence</div>
  <h1>{escape(report.title)}</h1>
  <p class="meta">Report {escape(report.id)} · generated {report.generated_at:%d %b %Y %H:%M UTC}
     · detection {escape(report.detection_id)}
     {f'· incident {escape(report.incident_id)}' if report.incident_id else ''}</p>

  <h2>Executive summary</h2>
  <div class="summary">{_md_to_html(report.executive_summary)}</div>

  <h2>Key facts</h2>
  {_key_facts_table(report)}

  <h2>Maps &amp; visualisations</h2>
  {figs or '<p class="meta">Visualisations unavailable; pipeline outputs incomplete.</p>'}

  {sections_html}
  <p class="disclaimer">{escape(report.disclaimer)}</p>
</main></body></html>"""


service = ReportService()
