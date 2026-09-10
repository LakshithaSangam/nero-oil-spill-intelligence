"""Responsible-Party Identification & Notification contracts.

After the investigation ranks suspect vessels, this identifies the organisation
behind the highest-confidence vessel and drafts a notification email for a human
operator to review, edit and send. The AI never sends anything itself.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

OrgType = Literal[
    "private_company",
    "government",
    "naval_coast_guard",
    "other_operator",
    "unknown",
]
RecipientKind = Literal["company", "authority"]
NotificationStatus = Literal["draft", "reviewed", "sent"]


class EmailDraft(BaseModel):
    to: str
    subject: str
    body: str
    generated_at: datetime


class ResponsibleParty(BaseModel):
    detection_id: str
    investigation_id: str | None = None

    # --- Step 1: the organisation behind the lead vessel ---
    vessel_mmsi: str | None = None
    vessel_name: str | None = None
    vessel_imo: str | None = None
    organization: str
    org_type: OrgType
    country: str | None = None
    #: confidence (0..1) that the spill is attributable to this organisation
    confidence: float = Field(ge=0, le=1)
    #: plain-language account of how the organisation was determined
    basis: str
    sources_checked: list[str] = Field(default_factory=list)

    # --- Step 2: who the notification should go to ---
    recipient_kind: RecipientKind
    recipient_name: str
    contact_email: str
    #: why it goes to an authority instead of the company (empty for company)
    authority_note: str = ""

    # --- Step 3: the draft ---
    email_draft: EmailDraft
    status: NotificationStatus = "draft"
    disclaimer: str = (
        "AI-generated draft for human review. Verify the recipient and every fact "
        "before sending. The system does not send email automatically."
    )
