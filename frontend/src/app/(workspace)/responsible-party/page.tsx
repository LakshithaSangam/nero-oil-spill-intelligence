"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  FileText,
  Landmark,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  ShieldQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useScenarioStore } from "@/store/scenario";
import { useDetectionStore } from "@/store/detection";
import { useInvestigationStore } from "@/store/investigation";
import { useInvestigationRunStore } from "@/store/investigationRun";
import {
  ORG_TYPE_LABEL,
  mailtoHref,
  useResponsiblePartyStore,
} from "@/store/responsibleParty";
import { resolveAuthority } from "@/lib/jurisdiction";
import type { NotificationStatus, ResponsibleParty, SpillDetection } from "@/types/api";

const STATUS_TONE: Record<NotificationStatus, "outline" | "warning" | "success"> = {
  draft: "outline",
  reviewed: "warning",
  sent: "success",
};
const STATUS_LABEL: Record<NotificationStatus, string> = {
  draft: "Draft, not reviewed",
  reviewed: "Reviewed, ready to send",
  sent: "Marked as sent",
};

export default function ResponsiblePartyPage() {
  const activeId = useScenarioStore((s) => s.activeId);
  const detection = useDetectionStore((s) => (activeId ? s.byScenario[activeId] : undefined));
  const ranking = useInvestigationStore((s) =>
    detection ? s.byDetection[detection.id] : undefined,
  );
  const runs = useInvestigationRunStore((s) => s.runs);
  const creating = useInvestigationRunStore((s) => s.creating);
  const runId = useMemo(() => {
    if (!activeId) return undefined;
    return Object.values(runs)
      .filter((r) => r.scenario_id === activeId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id;
  }, [runs, activeId]);
  const demoRunning =
    creating ||
    Object.values(runs).some((r) => r.scenario_id === activeId && r.status === "running");

  const load = useResponsiblePartyStore((s) => s.load);
  const loading = useResponsiblePartyStore((s) => s.loading);
  const error = useResponsiblePartyStore((s) => s.error);
  const detectionId = detection?.id;
  const hasRanking = Boolean(ranking);
  const rp = useResponsiblePartyStore((s) =>
    detectionId ? (s.byDetection[detectionId] ?? null) : null,
  );

  useEffect(() => {
    if (detectionId && hasRanking) void load(detectionId, runId);
  }, [detectionId, hasRanking, runId, load]);

  return (
    <div>
      <PanelHeader
        eyebrow="Investigation extension"
        title="Responsible party"
        subtitle="Who is behind the suspected vessel, who should be told, and a notification drafted for a human to review and send. The app never sends email itself."
        actions={
          detection && ranking ? (
            <button
              onClick={() => load(detection.id, runId, true)}
              aria-label="Rebuild"
              className="grid h-7 w-7 place-items-center rounded-sm border border-border text-text-subtle hover:text-text"
            >
              <RefreshCw size={13} className={loading === detection.id ? "animate-spin" : ""} />
            </button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-3">
        {(!detection || !ranking) && demoRunning && (
          <p className="flex items-center gap-2 text-xs text-text-subtle">
            <Spinner /> preparing the demo investigation…
          </p>
        )}

        {(!detection || !ranking) && !demoRunning && (
          <EmptyState hasDetection={Boolean(detection)} />
        )}

        {detection && ranking && loading === detection.id && !rp && (
          <p className="flex items-center gap-2 text-xs text-text-subtle">
            <Spinner /> checking ownership records and jurisdiction…
          </p>
        )}

        {detection && ranking && error && !rp && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[0.72rem] text-danger">
            {error}
          </p>
        )}

        {detection && rp && <Content detection={detection} rp={rp} />}
      </div>
    </div>
  );
}

function EmptyState({ hasDetection }: { hasDetection: boolean }) {
  return (
    <div className="rounded-sm border border-dashed border-border p-4 text-[0.75rem] leading-relaxed text-text-muted">
      <p className="font-medium text-text">Run an investigation first.</p>
      <p className="mt-1">
        {hasDetection
          ? "A spill is detected, but suspects have not been ranked yet. Open Investigations and run the agent workflow, then come back here."
          : "Pick a worked example on the dashboard and run the agent workflow. Once a suspect vessel is ranked, this tab identifies the organisation behind it and drafts a notification."}
      </p>
    </div>
  );
}

function Content({ detection, rp }: { detection: SpillDetection; rp: ResponsibleParty }) {
  const detectionId = detection.id;
  const edit = useResponsiblePartyStore((s) => s.edits[detectionId]);
  const statusOverride = useResponsiblePartyStore((s) => s.statusOverride[detectionId]);
  const sentRecord = useResponsiblePartyStore((s) => s.sent[detectionId]);
  const setDraft = useResponsiblePartyStore((s) => s.setDraft);
  const resetDraft = useResponsiblePartyStore((s) => s.resetDraft);
  const setStatus = useResponsiblePartyStore((s) => s.setStatus);
  const markSent = useResponsiblePartyStore((s) => s.markSent);

  // Did the AI actually pin a company? If not, route to the maritime authority
  // whose waters the spill sits in.
  const orgUnknown =
    rp.org_type === "unknown" ||
    !rp.organization ||
    /not identified|unknown|not on record/i.test(rp.organization);
  const backendAuthority =
    rp.recipient_kind === "authority" && rp.contact_email && !rp.contact_email.includes("unknown");
  const useAuthority = orgUnknown || rp.recipient_kind === "authority";

  const [lon, lat] = detection.geometry.centroid;
  const jur = useAuthority ? resolveAuthority(lon, lat) : null;

  const recipient = useAuthority
    ? {
        kind: "authority" as const,
        name: backendAuthority ? rp.recipient_name : jur!.authority,
        email: backendAuthority ? rp.contact_email : jur!.email,
        region: jur?.region ?? rp.country ?? "—",
        note: orgUnknown ? jur!.basis : rp.authority_note || jur!.basis,
      }
    : {
        kind: "company" as const,
        name: rp.recipient_name,
        email: rp.contact_email,
        region: rp.country ?? "—",
        note: rp.authority_note,
      };

  // when routing to an authority because no operator was found, the generated
  // company-addressed draft no longer fits — synthesise an authority version
  const authorityBody =
    `To: ${recipient.name}\n` +
    `Ref: Suspected marine oil discharge — ${detectionId}\n\n` +
    `An automated satellite screening has detected an oil slick within your area of ` +
    `responsibility (${recipient.region}), centred near ` +
    `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}.\n\n` +
    `Detected area: ~${Math.round(detection.geometry.area_km2)} km². ` +
    `Estimated release: see the attached investigation report (${detectionId}).\n\n` +
    `The polluting vessel could NOT be attributed from public ownership and AIS records ` +
    `(attribution confidence ${Math.round(rp.confidence * 100)}%). This notification is ` +
    `therefore addressed to the maritime authority with jurisdiction over the spill ` +
    `location, for verification, response tasking and any enforcement action.\n\n` +
    `${rp.basis}\n\n` +
    `This assessment is decision-support generated by an AI investigation pipeline and ` +
    `requires corroboration before enforcement action.`;

  const genSubject =
    useAuthority && orgUnknown
      ? `Unattributed oil spill in your waters — ${recipient.region} — ${detectionId}`
      : rp.email_draft.subject;
  const genBody = useAuthority && orgUnknown ? authorityBody : rp.email_draft.body;

  const draft = edit ?? { subject: genSubject, body: genBody };
  const edited = Boolean(edit);
  const status = statusOverride ?? rp.status ?? "draft";

  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const pct = Math.round(rp.confidence * 100);
  const confTone =
    rp.confidence >= 0.66 ? "text-success" : rp.confidence >= 0.4 ? "text-warning" : "text-danger";

  const isCompany = recipient.kind === "company";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `To: ${recipient.email}\nSubject: ${draft.subject}\n\n${draft.body}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  // Mock trial: simulate the dispatch inside the app. No real message leaves the
  // machine — the address uses the reserved .example domain.
  const sendSimulated = () => {
    const ok = window.confirm(
      `Simulated dispatch (mock trial). This records a notification to ` +
        `${recipient.name} <${recipient.email}> in the app timeline. No real email is sent.\n\nContinue?`,
    );
    if (!ok) return;
    setSending(true);
    setStatus(detectionId, "reviewed");
    window.setTimeout(() => {
      markSent(detectionId, {
        to: recipient.email,
        recipient: recipient.name,
        subject: draft.subject,
        at: new Date().toISOString(),
        channel: "simulated",
        routed_to_authority: recipient.kind === "authority",
      });
      setSending(false);
    }, 700);
  };

  const openInMailClient = () => {
    const ok = window.confirm(
      `This opens your own email client with the draft addressed to ${recipient.email}. ` +
        "Nothing is sent until you press send there. Continue?",
    );
    if (!ok) return;
    window.location.href = mailtoHref(recipient.email, draft.subject, draft.body);
    markSent(detectionId, {
      to: recipient.email,
      recipient: recipient.name,
      subject: draft.subject,
      at: new Date().toISOString(),
      channel: "mail-client",
      routed_to_authority: recipient.kind === "authority",
    });
  };

  return (
    <div className="space-y-4">
      {/* review-only disclaimer */}
      <div className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-[0.7rem] leading-relaxed text-warning">
        {rp.disclaimer}
      </div>

      {/* Step 1 — the organisation */}
      <section className="rounded-sm border border-border bg-surface-2/50 p-3">
        <StepLabel n={1} title="Responsible organisation" />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {rp.org_type === "unknown" ? (
                <ShieldQuestion size={13} className="shrink-0 text-text-subtle" />
              ) : (
                <Building2 size={13} className="shrink-0 text-text-subtle" />
              )}
              <span className="truncate text-[0.85rem] font-semibold text-text">
                {rp.organization}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.68rem]">
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-border px-1.5 py-0.5 font-medium uppercase tracking-wide text-text-muted">
                <Landmark size={9} /> {ORG_TYPE_LABEL[rp.org_type]}
              </span>
              {rp.country && <span className="text-text-subtle">Flag state: {rp.country}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={cn("tnum text-lg font-bold leading-none", confTone)}>{pct}%</div>
            <div className="eyebrow mt-0.5 text-[0.5rem]">attribution confidence</div>
          </div>
        </div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full",
              rp.confidence >= 0.66 ? "bg-success" : rp.confidence >= 0.4 ? "bg-warning" : "bg-danger",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-2 text-[0.68rem] leading-relaxed text-text-muted">{rp.basis}</p>

        {rp.vessel_name && (
          <p className="mt-1.5 text-[0.66rem] text-text-subtle">
            Lead suspect: {rp.vessel_name}
            {rp.vessel_mmsi ? ` · MMSI ${rp.vessel_mmsi}` : ""}
            {rp.vessel_imo ? ` · IMO ${rp.vessel_imo}` : ""}
          </p>
        )}

        <details className="mt-2 text-[0.66rem] text-text-subtle">
          <summary className="cursor-pointer text-text-muted">Sources checked</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {rp.sources_checked.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      </section>

      {/* Step 2 — the recipient */}
      <section className="rounded-sm border border-border bg-surface-2/50 p-3">
        <StepLabel n={2} title="Who gets notified" />
        {useAuthority && orgUnknown && (
          <p className="mt-2 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning">
            No operating company was attributed by the AI. Routed to the government maritime
            authority for the spill area.
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          {isCompany ? (
            <Building2 size={13} className="shrink-0 text-accent" />
          ) : (
            <Landmark size={13} className="shrink-0 text-accent" />
          )}
          <span className="text-[0.8rem] font-semibold text-text">{recipient.name}</span>
          <Badge tone={isCompany ? "accent" : "warning"}>
            {isCompany ? "Company" : "Government authority"}
          </Badge>
        </div>
        <div className="mt-1 text-[0.66rem] text-text-subtle">Jurisdiction: {recipient.region}</div>
        <a
          href={`mailto:${recipient.email}`}
          className="mt-1.5 flex items-center gap-1.5 text-[0.72rem] text-text-muted hover:text-accent"
        >
          <Mail size={11} /> {recipient.email}
        </a>
        {recipient.note && (
          <p className="mt-2 text-[0.66rem] leading-relaxed text-text-subtle">{recipient.note}</p>
        )}
      </section>

      {/* Step 3 — the draft */}
      <section className="rounded-sm border border-border bg-surface-2/50 p-3">
        <div className="flex items-center justify-between">
          <StepLabel n={3} title="Notification draft" />
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        </div>

        <div className="mt-2 flex gap-1 rounded-sm border border-border p-0.5 text-[0.7rem]">
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[3px] py-1 font-medium transition-colors",
              mode === "preview" ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text",
            )}
          >
            <FileText size={11} /> Preview
          </button>
          <button
            onClick={() => setMode("edit")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[3px] py-1 font-medium transition-colors",
              mode === "edit" ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text",
            )}
          >
            <Pencil size={11} /> Edit draft
          </button>
        </div>

        {mode === "preview" ? (
          <div className="mt-2 space-y-2">
            <div className="rounded-sm border border-border bg-surface-1 px-2.5 py-2 text-[0.7rem]">
              <div className="text-text-subtle">
                To: <span className="text-text-muted">{recipient.email}</span>
              </div>
              <div className="mt-0.5 text-text-subtle">
                Subject: <span className="text-text">{draft.subject}</span>
              </div>
            </div>
            <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-1 px-2.5 py-2 font-sans text-[0.7rem] leading-relaxed text-text-muted">
              {draft.body}
            </pre>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <label className="block text-[0.62rem] uppercase tracking-wide text-text-subtle">
              Subject
              <input
                value={draft.subject}
                onChange={(e) => setDraft(detectionId, { subject: e.target.value })}
                className="mt-1 w-full rounded-sm border border-border bg-surface-1 px-2 py-1.5 text-[0.72rem] normal-case tracking-normal text-text focus:border-accent/60 focus:outline-none"
              />
            </label>
            <label className="block text-[0.62rem] uppercase tracking-wide text-text-subtle">
              Body
              <textarea
                value={draft.body}
                onChange={(e) => setDraft(detectionId, { body: e.target.value })}
                rows={16}
                className="mt-1 w-full resize-y rounded-sm border border-border bg-surface-1 px-2 py-1.5 font-sans text-[0.72rem] normal-case leading-relaxed tracking-normal text-text focus:border-accent/60 focus:outline-none"
              />
            </label>
            {edited && (
              <button
                onClick={() => resetDraft(detectionId)}
                className="text-[0.66rem] text-text-subtle underline-offset-2 hover:text-accent hover:underline"
              >
                Revert to the generated draft
              </button>
            )}
          </div>
        )}

        {sentRecord ? (
          <div className="mt-3 rounded-sm border border-success/45 bg-success/10 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-success">
              <Check size={12} />
              {sentRecord.channel === "simulated"
                ? "Notification dispatched (simulated)"
                : "Handed to your mail client"}
            </div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.66rem]">
              <dt className="text-text-subtle">To</dt>
              <dd className="text-text">
                {sentRecord.recipient}
                {sentRecord.routed_to_authority && (
                  <span className="ml-1 text-warning">· maritime authority</span>
                )}
              </dd>
              <dt className="text-text-subtle">Address</dt>
              <dd className="tnum text-text-muted">{sentRecord.to}</dd>
              <dt className="text-text-subtle">Sent</dt>
              <dd className="tnum text-text-muted">
                {new Date(sentRecord.at).toISOString().replace("T", " ").slice(0, 16)}Z
              </dd>
              <dt className="text-text-subtle">Subject</dt>
              <dd className="text-text-muted">{sentRecord.subject}</dd>
            </dl>
            <div className="mt-2 flex gap-2">
              <button
                onClick={copy}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[0.66rem] font-medium text-text-muted hover:text-accent"
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy draft"}
              </button>
              <button
                onClick={sendSimulated}
                className="rounded-sm border border-border px-2 py-1 text-[0.66rem] font-medium text-text-muted hover:text-accent"
              >
                Re-send
              </button>
            </div>
            <p className="mt-2 text-[0.6rem] leading-relaxed text-text-subtle">
              Mock trial — no real message was transmitted. The address uses the reserved
              <span className="tnum"> .example </span> domain.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={copy}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[0.7rem] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied" : "Copy draft"}
              </button>
              <button
                onClick={openInMailClient}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[0.7rem] font-medium text-text-muted hover:border-accent/60 hover:text-accent"
              >
                <Mail size={11} /> Open in mail client
              </button>
              <button
                onClick={sendSimulated}
                disabled={sending}
                className="flex items-center gap-1.5 rounded-sm border border-accent/45 bg-accent/10 px-2.5 py-1.5 text-[0.7rem] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
              >
                {sending ? <Spinner /> : <Send size={11} />}
                {sending ? "Dispatching…" : "Send notification"}
              </button>
            </div>
            <p className="mt-2 text-[0.62rem] leading-relaxed text-text-subtle">
              <b className="text-text-muted">Send notification</b> records a dispatch to{" "}
              {isCompany ? "the operating company" : "the maritime authority"} in the app timeline
              for this mock trial — no real email leaves your machine. <b className="text-text-muted">
              Open in mail client</b> pre-fills a draft in your own email app instead.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-[0.6rem] font-bold text-accent">
        {n}
      </span>
      <h2 className="eyebrow text-[0.6rem]">{title}</h2>
    </div>
  );
}
