"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type { NotificationStatus, ResponsibleParty } from "@/types/api";

/** Local, unsent edits an operator makes to the generated draft. */
interface DraftEdit {
  subject: string;
  body: string;
}

/** A simulated dispatch record kept for the mock trial (no real mail is sent). */
export interface SentRecord {
  to: string;
  recipient: string;
  subject: string;
  at: string;
  channel: "simulated" | "mail-client";
  routed_to_authority: boolean;
}

interface RPState {
  byDetection: Record<string, ResponsibleParty>;
  edits: Record<string, DraftEdit>;
  /** operator-set status: the backend only ever returns "draft"; a human moves
   * it forward here after reviewing / sending from their own mail client. */
  statusOverride: Record<string, NotificationStatus>;
  loading: string | null;
  error: string | null;
  /** simulated dispatches, keyed by detection id */
  sent: Record<string, SentRecord>;
  load: (detectionId: string, investigationId?: string, refresh?: boolean) => Promise<void>;
  forDetection: (detectionId: string) => ResponsibleParty | null;
  draftFor: (detectionId: string) => DraftEdit | null;
  isEdited: (detectionId: string) => boolean;
  statusFor: (detectionId: string) => NotificationStatus;
  setDraft: (detectionId: string, patch: Partial<DraftEdit>) => void;
  resetDraft: (detectionId: string) => void;
  setStatus: (detectionId: string, status: NotificationStatus) => void;
  markSent: (detectionId: string, record: SentRecord) => void;
}

export const useResponsiblePartyStore = create<RPState>((set, get) => ({
  byDetection: {},
  edits: {},
  statusOverride: {},
  sent: {},
  loading: null,
  error: null,

  load: async (detectionId, investigationId, refresh) => {
    if (get().loading === detectionId) return;
    if (!refresh && get().byDetection[detectionId]) return;
    set({ loading: detectionId, error: null });
    try {
      const rp = await api<ResponsibleParty>(`/responsible-party/${detectionId}`, {
        params: { investigation_id: investigationId, refresh: refresh ? "true" : undefined },
      });
      set((s) => ({
        byDetection: { ...s.byDetection, [detectionId]: rp },
        // a refresh regenerates the draft, so drop stale local edits
        edits: refresh
          ? Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== detectionId))
          : s.edits,
        loading: null,
      }));
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "lookup failed";
      set({ loading: null, error: msg });
    }
  },

  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,

  draftFor: (detectionId) => {
    const edit = get().edits[detectionId];
    if (edit) return edit;
    const rp = get().byDetection[detectionId];
    return rp ? { subject: rp.email_draft.subject, body: rp.email_draft.body } : null;
  },

  isEdited: (detectionId) => Boolean(get().edits[detectionId]),

  statusFor: (detectionId) =>
    get().statusOverride[detectionId] ??
    get().byDetection[detectionId]?.status ??
    "draft",

  setDraft: (detectionId, patch) =>
    set((s) => {
      const rp = s.byDetection[detectionId];
      const base =
        s.edits[detectionId] ??
        (rp ? { subject: rp.email_draft.subject, body: rp.email_draft.body } : { subject: "", body: "" });
      return { edits: { ...s.edits, [detectionId]: { ...base, ...patch } } };
    }),

  resetDraft: (detectionId) =>
    set((s) => ({
      edits: Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== detectionId)),
    })),

  setStatus: (detectionId, status) =>
    set((s) => ({ statusOverride: { ...s.statusOverride, [detectionId]: status } })),

  markSent: (detectionId, record) =>
    set((s) => ({
      sent: { ...s.sent, [detectionId]: record },
      statusOverride: { ...s.statusOverride, [detectionId]: "sent" },
    })),
}));

/**
 * Build a `mailto:` link that opens the operator's own mail client with the
 * draft pre-filled. Nothing is sent by the app: the human reviews it in their
 * client and presses send there.
 */
export function mailtoHref(to: string, subject: string, body: string): string {
  const qs = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${to}?${qs}`;
}

export const ORG_TYPE_LABEL: Record<string, string> = {
  private_company: "Private shipping company",
  government: "Government organisation",
  naval_coast_guard: "Naval or coast guard agency",
  other_operator: "Other registered operator",
  unknown: "Not identified from public record",
};
