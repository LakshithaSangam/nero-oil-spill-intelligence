"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, FileText, Landmark, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useDetectionStore } from "@/store/detection";
import { useInvestigationStore } from "@/store/investigation";
import { useInvestigationRunStore } from "@/store/investigationRun";
import { useScenarioStore } from "@/store/scenario";
import {
  ORG_TYPE_LABEL,
  mailtoHref,
  useResponsiblePartyStore,
} from "@/store/responsibleParty";

/**
 * Dashboard add-on (does not replace anything): once suspects are ranked, show
 * the organisation behind the lead vessel, who should be notified, and the
 * review-only notification draft. Full editing lives on the Responsible party
 * tab; "send" only ever opens the operator's own mail client.
 */
export function ResponsiblePartySnapshot() {
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const ranking = useInvestigationStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const run = useInvestigationRunStore((s) => (activeId ? s.runForScenario(activeId) : null));

  const load = useResponsiblePartyStore((s) => s.load);
  const rp = useResponsiblePartyStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const status = useResponsiblePartyStore((s) =>
    detection ? s.statusFor(detection.id) : "draft",
  );

  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (detection && ranking) void load(detection.id, run?.id);
  }, [detection, ranking, run?.id, load]);

  if (!detection || !ranking || !rp) return null;

  const isCompany = rp.recipient_kind === "company";
  const pct = Math.round(rp.confidence * 100);

  const send = () => {
    const ok = window.confirm(
      `This opens your own email client with the draft addressed to ${rp.contact_email}. ` +
        "Nothing is sent until you press send there. Continue?",
    );
    if (!ok) return;
    window.location.href = mailtoHref(
      rp.contact_email,
      rp.email_draft.subject,
      rp.email_draft.body,
    );
    useResponsiblePartyStore.getState().setStatus(detection.id, "sent");
  };

  return (
    <section className="space-y-3">
      <h2 className="eyebrow text-[0.6rem]">Responsible party</h2>

      <div className="rounded-sm border border-border bg-surface-2/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="shrink-0 text-text-subtle" />
              <span className="truncate text-[0.82rem] font-semibold text-text">
                {rp.organization}
              </span>
            </div>
            <div className="mt-0.5 text-[0.68rem] text-text-muted">
              {ORG_TYPE_LABEL[rp.org_type]}
              {rp.country ? ` · ${rp.country}` : ""}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={cn(
                "tnum text-lg font-bold leading-none",
                rp.confidence >= 0.66
                  ? "text-success"
                  : rp.confidence >= 0.4
                    ? "text-warning"
                    : "text-danger",
              )}
            >
              {pct}%
            </div>
            <div className="eyebrow mt-0.5 text-[0.5rem]">confidence</div>
          </div>
        </div>

        {/* recipient */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[0.68rem]">
          <span className="inline-flex items-center gap-1 rounded-[3px] border border-border px-1.5 py-0.5 font-medium uppercase tracking-wide text-text-muted">
            {isCompany ? <Building2 size={9} /> : <Landmark size={9} />}
            {isCompany ? "Company" : "Government authority"}
          </span>
          <span className="truncate text-text-subtle">{rp.recipient_name}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[0.68rem] text-text-muted">
          <Mail size={10} className="shrink-0" /> {rp.contact_email}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <Badge tone={status === "sent" ? "success" : status === "reviewed" ? "warning" : "outline"}>
            {status === "sent"
              ? "Marked as sent"
              : status === "reviewed"
                ? "Reviewed"
                : "Draft, not reviewed"}
          </Badge>
        </div>

        {/* actions */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[0.7rem] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
          >
            <FileText size={11} /> {showPreview ? "Hide" : "Preview"} email
          </button>
          <Link
            href="/responsible-party"
            className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[0.7rem] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
          >
            <ArrowUpRight size={11} /> Edit draft
          </Link>
          <button
            onClick={send}
            className="flex items-center gap-1.5 rounded-sm border border-accent/45 bg-accent/10 px-2.5 py-1.5 text-[0.7rem] font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <Send size={11} /> Send notification
          </button>
        </div>

        {showPreview && (
          <div className="mt-2.5 space-y-1.5">
            <div className="rounded-sm border border-border bg-surface-1 px-2.5 py-2 text-[0.68rem]">
              <div className="text-text-subtle">
                To: <span className="text-text-muted">{rp.contact_email}</span>
              </div>
              <div className="mt-0.5 text-text-subtle">
                Subject: <span className="text-text">{rp.email_draft.subject}</span>
              </div>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-1 px-2.5 py-2 font-sans text-[0.68rem] leading-relaxed text-text-muted">
              {rp.email_draft.body}
            </pre>
          </div>
        )}

        <p className="mt-2 text-[0.6rem] leading-relaxed text-text-subtle">{rp.disclaimer}</p>
      </div>
    </section>
  );
}
