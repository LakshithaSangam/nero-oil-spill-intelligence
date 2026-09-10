"""Reference data for responsible-party notification.

Flag-state to country, coastal-state marine-pollution authorities with their
public reporting contacts, and a best-effort company-contact guess. The authority
contacts are the genuine public marine-pollution reporting addresses; company
addresses are synthesised from the operator name and always flagged as unverified.
"""

from __future__ import annotations

import re

# ISO-ish flag-state name -> country (enough for the scenario fleet + common flags)
FLAG_TO_COUNTRY: dict[str, str] = {
    "panama": "Panama",
    "liberia": "Liberia",
    "marshall islands": "Marshall Islands",
    "singapore": "Singapore",
    "malta": "Malta",
    "bahamas": "Bahamas",
    "hong kong": "Hong Kong SAR",
    "greece": "Greece",
    "india": "India",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "united states": "United States",
    "usa": "United States",
    "cyprus": "Cyprus",
    "gibraltar": "Gibraltar",
    "china": "China",
}


class Authority:
    def __init__(self, name: str, email: str, note: str) -> None:
        self.name = name
        self.email = email
        self.note = note


# Coastal / port state marine-pollution response authorities. Emails are the
# public incident-reporting addresses published by each body.
_AUTHORITIES: dict[str, Authority] = {
    "India": Authority(
        "Indian Coast Guard, Maritime Rescue Coordination Centre (Mumbai)",
        "mrcc-mumbai@indiancoastguard.gov.in",
        "Nodal agency for oil-spill response in Indian waters under the National "
        "Oil Spill Disaster Contingency Plan (NOS-DCP).",
    ),
    "United Kingdom": Authority(
        "Maritime and Coastguard Agency, Counter Pollution Branch",
        "counterpollution@mcga.gov.uk",
        "UK competent authority for marine pollution response.",
    ),
    "United States": Authority(
        "US Coast Guard, National Response Center",
        "lst-dg-nrcinfo@uscg.mil",
        "Federal point of contact for reporting oil and chemical spills (also "
        "1-800-424-8802).",
    ),
    "Australia": Authority(
        "Australian Maritime Safety Authority, Marine Environment Division",
        "rccaus@amsa.gov.au",
        "National plan authority for maritime environmental emergencies.",
    ),
    "Singapore": Authority(
        "Maritime and Port Authority of Singapore, Port Operations Control Centre",
        "marine@mpa.gov.sg",
        "Handles marine pollution incidents in Singapore port limits.",
    ),
}

_DEFAULT_AUTHORITY = Authority(
    "IMO Integrated Technical Cooperation / nearest coastal state maritime administration",
    "info@imo.org",
    "No single coastal-state authority resolved; route via the flag state's "
    "maritime administration and the nearest coastal state's pollution-response body.",
)


def country_for_flag(flag_state: str | None) -> str | None:
    if not flag_state:
        return None
    return FLAG_TO_COUNTRY.get(flag_state.strip().lower())


def authority_for_country(country: str | None) -> Authority:
    if country and country in _AUTHORITIES:
        return _AUTHORITIES[country]
    return _DEFAULT_AUTHORITY


def coastal_state_for_spill(lon: float, lat: float) -> str | None:
    """Very rough nearest-coastal-state guess for the regions the scenarios cover."""
    # NW Indian Ocean / Arabian Sea off Gujarat
    if 60.0 <= lon <= 78.0 and 6.0 <= lat <= 26.0:
        return "India"
    # NW Europe
    if -12.0 <= lon <= 3.0 and 48.0 <= lat <= 61.0:
        return "United Kingdom"
    # US Gulf / East coast
    if -98.0 <= lon <= -60.0 and 24.0 <= lat <= 46.0:
        return "United States"
    return None


def company_contact_guess(operator: str, domain_hint: str | None = None) -> tuple[str, str]:
    """(email, note) — a best-effort public contact for a shipping company.

    Real ownership/registry lookups aren't wired, so the address is synthesised
    from the company name and must be verified before use.
    """
    slug = re.sub(r"[^a-z0-9]+", "", operator.lower())
    slug = re.sub(
        r"(ltd|limited|inc|llc|gmbh|sa|pte|plc|bhd|co|corp|company|shipping|"
        r"maritime|group|holdings|management)$",
        "",
        slug,
    ) or "operator"
    domain = domain_hint or f"{slug}.example"
    return (
        f"hse.compliance@{domain}",
        "Synthesised from the operator name, not verified. Look up the real "
        "environmental-compliance or DPA contact in the company's ISM documents "
        "or public register before sending.",
    )
