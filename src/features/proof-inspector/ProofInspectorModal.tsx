import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Database,
  ExternalLink,
  HelpCircle,
  Info,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Email } from "@/components/mail/data";
import { motionPresets } from "@/lib/motion-presets";
import {
  errorLabel,
  normalizeApiClientError,
  sharedTypedApi,
  type ApiClientError,
} from "@/lib/api";
import { validateProofQuery } from "./utils";
import {
  classifyProofEvidence,
  fetchProofEvidence,
  proofVerdict,
  type ProofCheck,
  type ProofCheckState,
  type ProofEvidence,
  type ProofEvidenceApi,
  type ProofEvidenceSource,
} from "./evidence";

interface ProofInspectorModalProps {
  open: boolean;
  onClose: () => void;
  emails: Email[];
  onOpenMessage: (email: Email) => void;
  onShowToast: (message: string, options?: { tone: "success" | "neutral" | "danger" }) => void;
  initialQuery?: string;
  /** Current mailbox owner (recipient) used to verify testnet participants. */
  owner?: string | null;
  /** Demo / signed-out mode: message + storage evidence only, no network. */
  offline?: boolean;
  /** Typed API surface; defaults to the shared client. Testable via injection. */
  api?: ProofEvidenceApi;
}

type InspectStatus = "idle" | "loading" | "ready" | "error";

const stateStyles: Record<ProofCheckState, { badge: string; icon: typeof CheckCircle }> = {
  verified: {
    badge:
      "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
    icon: ShieldCheck,
  },
  pending: {
    badge: "bg-amber-500/10 text-status-warning dark:text-amber-400 border border-amber-500/20",
    icon: Clock,
  },
  missing: {
    badge: "bg-surface-tint/[0.04] text-muted-foreground border border-surface-tint/10",
    icon: HelpCircle,
  },
  mismatched: {
    badge: "bg-rose-500/10 text-status-danger dark:text-rose-400 border border-rose-500/20",
    icon: AlertTriangle,
  },
  tampered: {
    badge: "bg-red-500/10 text-status-danger dark:text-red-400 border border-red-500/20",
    icon: ShieldAlert,
  },
};

function formatStroops(amount?: string | null): string {
  if (!amount) return "—";
  const stroops = Number(amount);
  if (!Number.isFinite(stroops)) return "—";
  return `${(stroops / 10_000_000).toFixed(7)} XLM`;
}

export function ProofInspectorModal({
  open,
  onClose,
  emails,
  onOpenMessage,
  onShowToast,
  initialQuery = "",
  owner = null,
  offline = false,
  api,
}: ProofInspectorModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<InspectStatus>("idle");
  const [evidence, setEvidence] = useState<ProofEvidence | null>(null);
  const [source, setSource] = useState<ProofEvidenceSource>("local");
  const [error, setError] = useState<ApiClientError | null>(null);
  const [validationMsg, setValidationMsg] = useState<{
    text: string;
    type: "success" | "warning" | "error" | null;
  }>({ text: "", type: null });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setQuery("");
    setStatus("idle");
    setEvidence(null);
    setError(null);
    setValidationMsg({ text: "", type: null });
  }, []);

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      setError(null);
      try {
        const result = await fetchProofEvidence({
          query: trimmed,
          emails,
          api: api ?? sharedTypedApi,
          owner,
          offline,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setEvidence(result.evidence);
        setSource(result.source);
        setStatus("ready");
      } catch (caught) {
        if (controller.signal.aborted) return;
        const normalized = normalizeApiClientError(caught);
        setError(normalized);
        setStatus("error");
      }
    },
    [api, emails, offline, owner],
  );

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setStatus(initialQuery ? "loading" : "idle");
      setError(null);
      if (initialQuery) void runSearch(initialQuery);
    } else {
      reset();
    }
  }, [open, initialQuery, reset, runSearch]);

  useEffect(() => {
    setValidationMsg(validateProofQuery(query));
  }, [query]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const checks = useMemo<ProofCheck[]>(
    () => (evidence ? classifyProofEvidence(evidence, owner) : []),
    [evidence, owner],
  );
  const verdict = useMemo(() => proofVerdict(checks), [checks]);

  /** Narrowed record for the "found" branch so TS knows `message` exists. */
  const readyRecord = status === "ready" && evidence?.message ? evidence : null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} copied to clipboard`, { tone: "success" });
  };

  const selectedEmail = useMemo(() => {
    if (!readyRecord?.message) return null;
    return emails.find((email) => email.id === readyRecord.message?.messageId) ?? null;
  }, [emails, readyRecord]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            {...motionPresets.patterns.modal.backdrop}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-overlay/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            {...motionPresets.patterns.modal.content}
            role="dialog"
            aria-modal="true"
            aria-label="Cryptographic proof inspector"
            className="glass-strong fixed left-1/2 top-1/2 z-[101] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-surface-tint/10"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-surface-tint/[0.08] px-6 py-4 bg-surface-tint/[0.01]">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-brand-highlight" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Hush Proof Inspector</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Audit smart contract ledger proofs and payment preimages.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
                aria-label="Close inspector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 py-5 space-y-4">
              {/* Search Bar */}
              <div className="space-y-1.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch(query);
                  }}
                  className="relative flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setStatus((current) =>
                          current === "ready" || current === "error" ? "idle" : current,
                        );
                      }}
                      placeholder="Enter Message Hash, Payment Preimage, Address, or Sender..."
                      aria-label="Proof query"
                      className={cn(
                        "glow-ring h-10 w-full min-w-0 rounded-xl border pl-9 pr-10 text-xs text-foreground bg-surface-recessed/40",
                        validationMsg.type === "error"
                          ? "border-red-500/40 focus:border-red-500/60"
                          : "border-surface-tint/10 focus:border-surface-tint/20",
                      )}
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setStatus("idle");
                          setEvidence(null);
                        }}
                        className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label="Clear query"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="h-10 rounded-xl bg-primary dark:bg-white px-4 text-xs font-bold text-primary-foreground dark:text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-surface-tint/30 disabled:opacity-50"
                  >
                    {status === "loading" ? "Searching..." : "Inspect"}
                  </button>
                </form>

                {/* Format validation status feedback */}
                {validationMsg.text && status !== "error" && (
                  <p
                    className={cn(
                      "text-[10px] font-medium leading-none px-1",
                      validationMsg.type === "success" &&
                        "text-status-success dark:text-emerald-400",
                      validationMsg.type === "warning" && "text-status-warning dark:text-amber-400",
                      validationMsg.type === "error" && "text-status-danger dark:text-red-400",
                    )}
                  >
                    {validationMsg.text}
                  </p>
                )}
              </div>

              {/* Suggestions / Shortcuts when idle */}
              {status === "idle" && (
                <div className="space-y-2.5 pt-2">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Quick shortcuts (messages in this mailbox)
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {emails.slice(0, 4).map((email) => (
                      <button
                        key={email.id}
                        onClick={() => {
                          setQuery(email.id);
                          void runSearch(email.id);
                        }}
                        className="flex items-start gap-2.5 rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-2.5 text-left text-xs transition hover:bg-surface-tint/[0.04] hover:border-surface-tint/10"
                      >
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground/80 truncate">{email.from}</p>
                          <p className="font-mono text-[9px] text-muted-foreground truncate mt-0.5">
                            {email.id.slice(0, 20)}...
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {/* Loading state — driven by the real evidence fetch, no fake delays */}
                {status === "loading" && (
                  <motion.div
                    key="loading-state"
                    {...motionPresets.entrance.fadeIn()}
                    className="space-y-4 pt-2"
                  >
                    <div className="h-16 w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="h-[120px] w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                      <div className="h-[120px] w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                      <div className="h-[120px] w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                      <div className="h-[120px] w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                    </div>
                    <div className="h-10 w-full animate-pulse rounded-xl bg-surface-tint/[0.03] border border-surface-tint/[0.05]" />
                  </motion.div>
                )}

                {/* Error state with safe retry that preserves the query */}
                {status === "error" && error && (
                  <motion.div
                    key="error-state"
                    {...motionPresets.entrance.fadeIn()}
                    className="rounded-xl border border-rose-500/20 bg-rose-500/[0.01] p-4 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-500/10 text-status-danger dark:text-rose-400 border border-rose-500/20 shrink-0">
                        <ShieldAlert className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-foreground">
                          Proof evidence unavailable
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {errorLabel(error)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-surface-tint/5 pt-3">
                      <button
                        type="button"
                        onClick={() => void runSearch(query)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary dark:bg-white px-3 py-2 text-xs font-bold text-primary-foreground dark:text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-surface-tint/30"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        Query preserved: <span className="font-mono">{query}</span>
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Ready: not found or populated evidence */}
                {status === "ready" && (
                  <motion.div key="result-state" {...motionPresets.entrance.fadeIn()}>
                    {!readyRecord?.message ? (
                      /* MISSING RECORDS / NEXT STEPS GUIDE */
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.01] p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-500/10 text-status-danger dark:text-rose-400 border border-rose-500/20 shrink-0">
                            <ShieldAlert className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-foreground">
                              Proof Record Not Found
                            </h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              No message in this mailbox matches your search query, so no proof
                              evidence can be shown.
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-surface-tint/5 pt-3.5 space-y-2.5">
                          <h5 className="text-[10px] uppercase tracking-wider text-status-danger/90 dark:text-rose-400/90 font-semibold flex items-center gap-1.5">
                            <Terminal className="h-3 w-3" />
                            Recommended Next Steps
                          </h5>
                          <ul className="space-y-2 text-xs">
                            <li className="flex items-start gap-2">
                              <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                                1.
                              </span>
                              <p className="text-muted-foreground leading-normal">
                                <strong className="text-foreground/90 block">
                                  Search with a message identifier
                                </strong>
                                Use the message hash, payment preimage, sender address, or a sender
                                name present in this mailbox.
                              </p>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                                2.
                              </span>
                              <p className="text-muted-foreground leading-normal">
                                <strong className="text-foreground/90 block">
                                  Verify on Stellar Explorer
                                </strong>
                                Search any copied transaction hash on{" "}
                                <a
                                  href="https://stellar.expert"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-status-success dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                >
                                  Stellar.Expert
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>{" "}
                                to confirm settlement on testnet.
                              </p>
                            </li>
                          </ul>
                        </div>
                      </div>
                    ) : (
                      /* RECORD FOUND & DETAILED SECTIONS */
                      <div className="space-y-4">
                        {/* Verdict banner */}
                        <div
                          className={cn(
                            "flex items-start gap-2.5 rounded-xl border p-3 text-xs",
                            verdict.state === "verified" &&
                              "border-emerald-500/20 bg-emerald-500/[0.03]",
                            verdict.state === "pending" &&
                              "border-amber-500/20 bg-amber-500/[0.03]",
                            (verdict.state === "conflict" || verdict.state === "tampered") &&
                              "border-rose-500/20 bg-rose-500/[0.03]",
                            verdict.state === "incomplete" &&
                              "border-surface-tint/10 bg-surface-tint/[0.02]",
                          )}
                        >
                          {verdict.state === "verified" ? (
                            <ShieldCheck className="h-4 w-4 text-status-success dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : verdict.state === "pending" ? (
                            <Clock className="h-4 w-4 text-status-warning dark:text-amber-400 shrink-0 mt-0.5" />
                          ) : verdict.state === "conflict" || verdict.state === "tampered" ? (
                            <ShieldAlert className="h-4 w-4 text-status-danger dark:text-rose-400 shrink-0 mt-0.5" />
                          ) : (
                            <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-foreground">
                              {verdict.label}
                              <span className="ml-2 font-normal text-muted-foreground text-[10px]">
                                {source === "local" ? "local evidence" : "testnet evidence"}
                                {readyRecord.fetchedAt
                                  ? ` · ${new Date(readyRecord.fetchedAt).toLocaleTimeString()}`
                                  : ""}
                              </span>
                            </p>
                            <p className="text-muted-foreground mt-0.5 leading-normal">
                              {verdict.detail}
                            </p>
                          </div>
                        </div>

                        {/* Security Alert: Sensitive payload notice */}
                        <div className="flex items-start gap-2.5 rounded-lg bg-surface-tint/[0.02] border border-surface-tint/[0.04] p-3 text-xs text-muted-foreground leading-normal">
                          <Info className="h-3.5 w-3.5 text-brand-highlight shrink-0 mt-0.5" />
                          <p>
                            <span className="font-semibold text-foreground/80">
                              Diagnostic Mode:
                            </span>{" "}
                            Plaintext payload body and sensitive email attachments are omitted for
                            privacy. Use the "Open Message" button to view and decrypt the message
                            content securely. Ciphertext keys are never exposed.
                          </p>
                        </div>

                        {/* Header overview */}
                        <div className="flex items-center justify-between rounded-xl bg-surface-tint/[0.02] border border-surface-tint/5 p-3 text-xs">
                          <div>
                            <span className="text-muted-foreground">Subject (Omitted preview)</span>
                            <span className="font-semibold text-foreground block mt-0.5">
                              {readyRecord.message.subject.replace(/./g, (c, i) =>
                                i > 4 && i < 20 ? "•" : c,
                              )}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground">Verification State</span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 font-semibold block mt-0.5",
                                verdict.state === "verified" &&
                                  "text-status-success dark:text-emerald-400",
                                verdict.state === "pending" &&
                                  "text-status-warning dark:text-amber-400",
                                (verdict.state === "conflict" || verdict.state === "tampered") &&
                                  "text-status-danger dark:text-rose-400",
                                verdict.state === "incomplete" && "text-muted-foreground",
                              )}
                            >
                              {verdict.state === "verified" ? (
                                <CheckCircle className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              {verdict.label}
                            </span>
                          </div>
                        </div>

                        {/* Per-check classification */}
                        <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-3 space-y-2">
                          <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-surface-tint/5 pb-1">
                            Proof checks
                          </h5>
                          <ul className="space-y-2">
                            {checks.map((check) => {
                              const style = stateStyles[check.state];
                              const Icon = style.icon;
                              return (
                                <li key={check.key} className="flex items-start gap-2.5 text-xs">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 mt-0.5",
                                      style.badge,
                                    )}
                                  >
                                    <Icon className="h-3 w-3" />
                                    {check.state}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-foreground/90">
                                      {check.label}
                                    </p>
                                    <p className="text-muted-foreground leading-normal">
                                      {check.detail}
                                    </p>
                                    {(check.copyable || check.explorerUrl) && (
                                      <div className="flex flex-wrap items-center gap-2 mt-1">
                                        {check.copyable && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              copyToClipboard(check.copyable!, check.label)
                                            }
                                            className="inline-flex items-center gap-1 font-mono text-[9px] text-status-success dark:text-emerald-400 hover:underline"
                                          >
                                            {check.copyable.slice(0, 12)}...
                                            <Copy className="h-2.5 w-2.5" />
                                          </button>
                                        )}
                                        {check.explorerUrl && (
                                          <a
                                            href={check.explorerUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground"
                                          >
                                            Stellar.Expert
                                            <ExternalLink className="h-2.5 w-2.5" />
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {/* Structured Details Sections Grid */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {/* Section 1: Policy Info */}
                          <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-3 space-y-2">
                            <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-surface-tint/5 pb-1">
                              Policy Metadata
                            </h5>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Sender Rule:</span>
                                <span className="font-mono text-foreground capitalize">
                                  {readyRecord.message.senderRule ?? "default"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Cryptographic Contact:
                                </span>
                                <span className="text-foreground font-medium">
                                  {readyRecord.message.senderVerified ? "Yes" : "No"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Postage Required:</span>
                                <span className="text-foreground font-medium">
                                  {readyRecord.message.postageAmount ? "Yes" : "No"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Postage Info */}
                          <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-3 space-y-2">
                            <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-surface-tint/5 pb-1">
                              Postage details
                            </h5>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Postage Amount:</span>
                                <span className="font-semibold text-foreground">
                                  {readyRecord.postage
                                    ? formatStroops(readyRecord.postage.amount)
                                    : "Missing on testnet"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Postage Status:</span>
                                <span
                                  className={cn(
                                    "font-semibold uppercase text-[9px] px-1 rounded",
                                    readyRecord.postage?.status === "settled" &&
                                      "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
                                    (readyRecord.postage?.status === "pending" ||
                                      readyRecord.postage?.status === "expired") &&
                                      "bg-amber-500/10 text-status-warning dark:text-amber-400 border border-amber-500/20",
                                    (readyRecord.postage?.status === "refunded" ||
                                      readyRecord.postage?.status === "reclaimed") &&
                                      "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
                                    readyRecord.postage?.status === "disputed" &&
                                      "bg-red-500/10 text-status-danger dark:text-red-400 border border-red-500/20",
                                    !readyRecord.postage &&
                                      "bg-surface-tint/[0.04] text-muted-foreground",
                                  )}
                                >
                                  {readyRecord.postage?.status ?? "missing"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Payment Hash:</span>
                                {readyRecord.postage ? (
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        readyRecord.postage!.paymentHash,
                                        "Payment Hash",
                                      )
                                    }
                                    className="font-mono text-[10px] text-status-success dark:text-emerald-400 hover:underline flex items-center gap-1"
                                  >
                                    {readyRecord.postage.paymentHash.slice(0, 8)}...
                                    <Copy className="h-2.5 w-2.5" />
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Receipt Info */}
                          <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-3 space-y-2">
                            <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-surface-tint/5 pb-1">
                              Receipt details
                            </h5>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Delivered At:</span>
                                <span className="text-foreground">
                                  {readyRecord.receipt
                                    ? new Date(readyRecord.receipt.deliveredAt).toLocaleString()
                                    : "Missing on testnet"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Read Receipt:</span>
                                <span className="text-foreground">
                                  {readyRecord.receipt?.readAt
                                    ? new Date(readyRecord.receipt.readAt).toLocaleString()
                                    : readyRecord.receipt
                                      ? "Pending read confirmation"
                                      : "Missing on testnet"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Sender Key:</span>
                                <button
                                  onClick={() =>
                                    copyToClipboard(readyRecord.message!.email, "Sender address")
                                  }
                                  className="font-mono text-[9px] text-foreground/80 hover:underline flex items-center gap-0.5"
                                >
                                  {readyRecord.message.email.slice(0, 12)}...
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Section 4: Relay Metadata */}
                          <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.01] p-3 space-y-2">
                            <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-surface-tint/5 pb-1">
                              Relay metadata
                            </h5>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Relay Record:</span>
                                <span className="text-foreground">
                                  {source === "testnet" ? "Awaiting relay receipt" : "Local only"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Message ID:</span>
                                <span className="text-foreground font-mono text-[10px]">
                                  {readyRecord.message.messageId.slice(0, 16)}...
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Diagnostic ID:</span>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      readyRecord.message!.messageId,
                                      "Message diagnostic ID",
                                    )
                                  }
                                  className="font-mono text-[9px] text-foreground/80 hover:underline flex items-center gap-0.5"
                                >
                                  {readyRecord.message.messageId.slice(0, 12)}...
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Diagnostic JSON Copy report */}
                        <button
                          onClick={() =>
                            copyToClipboard(
                              JSON.stringify(
                                {
                                  query,
                                  fetchedAt: readyRecord.fetchedAt,
                                  source,
                                  message: {
                                    messageId: readyRecord.message!.messageId,
                                    sender: readyRecord.message!.email,
                                    digest: readyRecord.message!.digest,
                                    contentCommitment: readyRecord.message!.contentCommitment,
                                  },
                                  postage: readyRecord.postage
                                    ? {
                                        status: readyRecord.postage.status,
                                        paymentHash: readyRecord.postage.paymentHash,
                                        amount: readyRecord.postage.amount,
                                      }
                                    : null,
                                  receipt: readyRecord.receipt
                                    ? {
                                        deliveredAt: readyRecord.receipt.deliveredAt,
                                        readAt: readyRecord.receipt.readAt,
                                        txHash: readyRecord.receipt.txHash,
                                        chainStatus: readyRecord.receipt.chainStatus,
                                      }
                                    : null,
                                  lifecycle: readyRecord.lifecycle
                                    ? {
                                        status: readyRecord.lifecycle.status,
                                        txHash: readyRecord.lifecycle.txHash,
                                        verified: readyRecord.lifecycle.verified,
                                      }
                                    : null,
                                  checks: checks.map((check) => ({
                                    key: check.key,
                                    state: check.state,
                                  })),
                                },
                                null,
                                2,
                              ),
                              "Proof diagnostic report",
                            )
                          }
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-surface-tint/10 bg-surface-tint/[0.02] py-2 text-xs font-semibold text-foreground transition hover:bg-surface-tint/5 focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Proof Diagnostic Report
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Modal Footer CTAs */}
            <div className="flex items-center justify-between border-t border-surface-tint/[0.08] px-6 py-4 bg-surface-tint/[0.01]">
              <div className="flex items-center gap-2">
                {selectedEmail && status === "ready" && !error && (
                  <>
                    <a
                      href={
                        readyRecord?.postage
                          ? `https://stellar.expert/explorer/testnet/tx/${readyRecord.postage.paymentHash}`
                          : readyRecord?.lifecycle?.txHash
                            ? `https://stellar.expert/explorer/testnet/tx/${readyRecord.lifecycle.txHash}`
                            : "https://stellar.expert"
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-surface-tint/10 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
                    >
                      Stellar.Expert
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        onOpenMessage(selectedEmail);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary dark:bg-white px-4 py-2 text-xs font-bold text-primary-foreground dark:text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-surface-tint/30"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Open Message
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={onClose}
                className="rounded-xl border border-surface-tint/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-tint/5 focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
