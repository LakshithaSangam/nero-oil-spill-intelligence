"""Responsible-Party Identification & Notification (investigation extension).

Reads the finished investigation for a detection, works out the organisation
behind the highest-confidence vessel, picks who to notify (that company, or the
relevant maritime authority when the company can't be pinned down), and drafts a
notification email for a human to review, edit and send.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.logging import get_logger
from app.modules.cause_classification import classify
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.modules.similarity.service import service as similarity_service
from app.schemas.responsible_party import EmailDraft, OrgType, ResponsibleParty
from app.services.authorities import (
    authority_for_country,
    coastal_state_for_spill,
    company_contact_guess,
    country_for_flag,
)
from app.services.report_visuals import biodiversity_risk, cleanup_urgency, operator_class

log = get_logger(__name__)

_SOURCES = [
    "AIS static data (name / MMSI / IMO / flag)",
    "operator & registered-owner fields from the AIS provider",
    "flag-state register / IMO GISIS lookup pattern",
    "public shipping-company name matching",
]

_LABEL_TO_TYPE: dict[str, OrgType] = {
    "Naval / Coast Guard authority": "naval_coast_guard",
    "Government organisation": "government",
    "Private company": "private_company",
    "Other registered operator": "other_operator",
    "Unknown — not on public record": "unknown",
    "Unknown, not on public record": "unknown",
}


class ResponsiblePartyError(RuntimeError):
    pass


class ResponsiblePartyService:
    def __init__(self) -> None:
        self._store: dict[str, ResponsibleParty] = {}

    def get(self, detection_id: str) -> ResponsibleParty | None:
        return self._store.get(detection_id)

    async def identify(
        self, detection_id: str, *, investigation_id: str | None = None
    ) -> ResponsibleParty:
        detection = detection_service.get(detection_id)
        suspects = investigation_service.get(detection_id)
        if detection is None or suspects is None or not suspects.cards:
            raise ResponsiblePartyError(
                "run the full investigation (detection through suspect ranking) first"
            )
        hindcast = ocean_service.get_hindcast(detection_id)
        forecast = ocean_service.get_forecast(detection_id)
        environmental = environmental_service.get(detection_id)
        if environmental is None:
            environmental = await environmental_service.assess(detection_id)

        lead = suspects.cards[0]
        v = lead.vessel

        # --- Step 1: the organisation ---
        org_label, org_basis = operator_class(v)
        org_type = _LABEL_TO_TYPE.get(org_label, "unknown")
        organization = v.operator_company or v.owner or (v.name or f"MMSI {v.mmsi}")
        country = country_for_flag(v.flag_state)

        # confidence in attributing the spill to this organisation:
        # how well we identified the org  ×  how strong the vessel attribution is
        id_conf = {
            "private_company": 0.8 if v.operator_company else 0.62,
            "government": 0.7,
            "naval_coast_guard": 0.72,
            "other_operator": 0.55,
            "unknown": 0.2,
        }[org_type]
        attribution = 0.5 * lead.suspicion_score + 0.5 * lead.confidence.score
        confidence = round(id_conf * (0.55 + 0.45 * attribution), 2)

        # --- Step 2: recipient ---
        can_reach_company = (
            org_type in ("private_company", "other_operator")
            and confidence >= 0.55
            and bool(v.operator_company or v.owner)
        )
        if can_reach_company:
            email, contact_note = company_contact_guess(organization)
            recipient_kind = "company"
            recipient_name = organization
            authority_note = ""
        else:
            o = hindcast.origin.point if hindcast else None
            lon = o.lon if o else detection.geometry.centroid[0]
            lat = o.lat if o else detection.geometry.centroid[1]
            state = coastal_state_for_spill(lon, lat) or country
            auth = authority_for_country(state)
            email = auth.email
            contact_note = auth.note
            recipient_kind = "authority"
            recipient_name = auth.name
            authority_note = (
                "The responsible vessel is identified but the operating company "
                "could not be confirmed to the confidence needed to contact it "
                f"directly ({int(confidence * 100)}%), so this goes to the "
                f"jurisdiction's marine-pollution authority."
                if org_type != "unknown"
                else "No vessel could be attributed with confidence; routing to the "
                "jurisdiction's marine-pollution authority for investigation."
            )

        # --- Step 3: the draft ---
        similar = similarity_service.get(detection_id)
        cause = classify(detection, hindcast, suspects, similar) if hindcast else None
        draft = _draft_email(
            to=email,
            recipient_kind=recipient_kind,
            recipient_name=recipient_name,
            organization=organization,
            confidence=confidence,
            investigation_id=investigation_id or f"INV-{detection_id[-8:]}",
            detection=detection,
            hindcast=hindcast,
            forecast=forecast,
            environmental=environmental,
            cause=cause,
            lead=lead,
        )

        rp = ResponsibleParty(
            detection_id=detection_id,
            investigation_id=investigation_id,
            vessel_mmsi=v.mmsi,
            vessel_name=v.name,
            vessel_imo=v.imo,
            organization=organization,
            org_type=org_type,
            country=country,
            confidence=confidence,
            basis=f"{org_label}. {org_basis}",
            sources_checked=_SOURCES,
            recipient_kind=recipient_kind,
            recipient_name=recipient_name,
            contact_email=email,
            authority_note=(authority_note + " " + contact_note).strip(),
            email_draft=draft,
        )
        self._store[detection_id] = rp
        log.info(
            "responsible party for %s: %s (%s, %d%%) -> %s",
            detection_id, organization, org_type, int(confidence * 100), email,
        )
        return rp


# --------------------------------------------------------------------------- #
def _usd(n: float) -> str:
    if n >= 1e6:
        return f"US${n / 1e6:.1f}M"
    return f"US${n / 1e3:,.0f}k"


def _draft_email(  # noqa: PLR0913 - it is a template, every field is spelled out on purpose
    *,
    to: str,
    recipient_kind: str,
    recipient_name: str,
    organization: str,
    confidence: float,
    investigation_id: str,
    detection,  # noqa: ANN001
    hindcast,  # noqa: ANN001
    forecast,  # noqa: ANN001
    environmental,  # noqa: ANN001
    cause,  # noqa: ANN001
    lead,  # noqa: ANN001
) -> EmailDraft:
    g = detection.geometry
    c = detection.characterisation
    o = hindcast.origin if hindcast else None
    v = lead.vessel
    coords = (
        f"{o.point.lat:.3f} N, {o.point.lon:.3f} E" if o
        else f"{g.centroid[1]:.3f} N, {g.centroid[0]:.3f} E"
    )
    window = (
        f"{o.release_window.start:%d %b %Y %H:%MZ} to {o.release_window.end:%d %b %Y %H:%MZ}"
        if o else "not established"
    )
    vol = f"{c.estimated_volume_bbl_low:,.0f} to {c.estimated_volume_bbl_high:,.0f} bbl"

    reached = [a for a in (forecast.affected_coasts if forecast else []) if a.eta is not None]
    if reached:
        spread = (
            f"Projected to reach {reached[0].name} around {reached[0].eta:%d %b %H:%MZ} "
            f"(~{int(reached[0].likelihood * 100)}% of drift scenarios)."
        )
    else:
        spread = "No shoreline contact projected within the forecast horizon."
    area_curve = ""
    if forecast and forecast.expected_area_km2_by_hour:
        pts = sorted(forecast.expected_area_km2_by_hour.items(), key=lambda kv: int(kv[0]))
        area_curve = " Slick extent " + ", ".join(f"{h} h ~{val:.0f} km2" for h, val in pts) + "."

    biod_band, _ = biodiversity_risk(environmental)
    urg_level, urg_score, _ = cleanup_urgency(environmental.priority_score, biod_band)
    env_line = (
        f"Environmental priority {environmental.priority_score * 100:.0f}%. "
        f"Marine biodiversity risk: {biod_band}. "
        f"Marine life in the area: {environmental.marine_biodiversity}, an estimated "
        f"{environmental.marine_life_affected_pct:.0f}% affected. "
        f"Cleanup cost {_usd(environmental.estimated_cleanup_cost_usd_low)} to "
        f"{_usd(environmental.estimated_cleanup_cost_usd_high)}."
    )

    evidence = list(cause.supporting_evidence) if cause else []
    evidence += [
        f.summary for f in lead.factors
        if f.polarity == "incriminating" and f.summary not in evidence
    ]
    evidence_block = "\n".join(f"  - {e}" for e in evidence[:6]) or "  - see attached investigation report"

    facts = (
        f"Investigation ID: {investigation_id}\n"
        f"Detected: {detection.detected_at:%d %b %Y %H:%M UTC} (Sentinel-1 SAR)\n"
        f"Spill position: {coords}\n"
        f"Estimated size: {g.area_km2:.1f} km2, {vol} ({c.thickness_class} film)\n"
        f"Estimated origin: {coords}, released {window}\n"
        f"Suspected vessel: {v.name or 'unknown'} (MMSI {v.mmsi}, IMO {v.imo or 'n/a'}, "
        f"{v.vessel_type}, flag {v.flag_state or 'n/a'})\n"
        f"Attribution confidence: {int(lead.suspicion_score * 100)}% suspicion, "
        f"{int(lead.confidence.score * 100)}% confidence in the attribution\n"
        f"Cleanup urgency: {urg_level} ({urg_score}/100)\n"
    )

    if recipient_kind == "company":
        subject = (
            f"Urgent: vessel {v.name or v.mmsi} identified as likely source of an oil "
            f"spill ({investigation_id})"
        )
        body = (
            f"To: {recipient_name}\n\n"
            f"An automated maritime oil-spill investigation has identified a vessel "
            f"operated by your organisation as the most likely source of a detected "
            f"oil spill.\n\n"
            f"{facts}\n"
            f"Supporting evidence:\n{evidence_block}\n\n"
            f"Environmental impact:\n{env_line}\n\n"
            f"Predicted spread:\n{spread}{area_curve}\n\n"
            f"We are notifying you as the identified operator ({organization}, "
            f"attribution confidence {int(confidence * 100)}%). Please verify your "
            f"vessel's position and operations for the release window above and "
            f"respond with confirmation and any corrective action within 24 hours. "
            f"This notification is being shared with the relevant maritime authority.\n\n"
            f"This assessment is decision-support generated by an AI investigation "
            f"pipeline and requires corroboration before enforcement action.\n"
        )
    else:
        subject = (
            f"Oil spill detected: request for investigation and response "
            f"({investigation_id})"
        )
        body = (
            f"To: {recipient_name}\n\n"
            f"An automated maritime oil-spill investigation has detected an oil spill "
            f"in waters under your jurisdiction. A suspect vessel has been ranked but "
            f"the responsible operator could not be confirmed with sufficient "
            f"confidence to contact directly.\n\n"
            f"{facts}\n"
            f"Supporting evidence:\n{evidence_block}\n\n"
            f"Environmental impact:\n{env_line}\n\n"
            f"Predicted spread:\n{spread}{area_curve}\n\n"
            f"Given the environmental risk, we request immediate investigation and "
            f"response, and tasking of a surface asset to the estimated origin and "
            f"along the forecast drift axis for confirmation and sampling.\n\n"
            f"This assessment is decision-support generated by an AI investigation "
            f"pipeline and requires corroboration before enforcement action.\n"
        )

    return EmailDraft(to=to, subject=subject, body=body, generated_at=datetime.now(UTC))


service = ResponsiblePartyService()
