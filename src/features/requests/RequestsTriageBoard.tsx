import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle,
  FileText,
  HelpCircle,
  ShieldCheck,
  Users,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { Email } from "@/components/mail/data";
import { motionPresets } from "@/lib/motion-presets";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { RequestCard } from "./RequestCard";
import type { CardStatus, RequestCardState, TriageAction } from "./types";
import { useSession, sessionActor } from "@/features/mail/useSession";
import { useRequests, useSenderRequestDecision } from "@/features/mail/useRequests";

interface RequestsTriageBoardProps {
  emails: Email[];
  onUpdateEmail: (id: string, patch: Partial<Email>) => void;
  onShowToast: (message: string, options?: { tone: "success" | "neutral" | "danger" }) => void;
  isDemoMode?: boolean;
}

export function RequestsTriageBoard({
  emails,
  onUpdateEmail,
  onShowToast,
  isDemoMode = false,
}: Readonly<RequestsTriageBoardProps>) {
  const [cardStates, setCardStates] = useState<Record<string, RequestCardState>>({});
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [inspectEmail, setInspectEmail] = useState<Email | null>(null);

  // Pagination states
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [liveRequests, setLiveRequests] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk dialog states
  const [bulkAction, setBulkAction] = useState<TriageAction | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState<{
    action: TriageAction;
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    failures: { sender: string; error: string }[];
  } | null>(null);

  // Session & Live Requests Queries
  const session = useSession({ enabled: !isDemoMode });
  const actor = sessionActor(session.data);

  const { data: serverPage, isLoading: isRequestsLoading } = useRequests(
    actor,
    { cursor, limit: 10 },
    !isDemoMode && !isDemoMode,
  );

  const decisionMutation = useSenderRequestDecision(actor);

  // Sync server page to stateful live requests list
  useEffect(() => {
    if (isDemoMode) return;
    if (serverPage) {
      setLiveRequests((prev) => {
        // If cursor is undefined, it's the first page / reset
        if (!cursor) {
          setNextCursor(serverPage.nextCursor);
          return serverPage.items;
        }
        const prevMap = new Map(prev.map((item) => [item.requestId, item]));
        for (const item of serverPage.items) {
          prevMap.set(item.requestId, item);
        }
        setNextCursor(serverPage.nextCursor);
        return [...prevMap.values()];
      });
    }
  }, [serverPage, cursor, isDemoMode]);

  // Reset live requests list if actor changes or isDemoMode switches
  useEffect(() => {
    setLiveRequests([]);
    setCursor(undefined);
    setSelectedIds(new Set());
  }, [actor, isDemoMode]);

  // Map requests to Email shape
  const requests = useMemo(() => {
    if (isDemoMode) {
      return emails.filter((email) => email.folder === "requests");
    }

    return liveRequests.map((req) => {
      const email = emails.find((e) => e.id === req.message.messageId);
      if (email) {
        return {
          ...email,
          folder: "requests" as const,
          requestId: req.requestId,
          postageAmount: req.postageAmount ?? email.postageAmount,
          verifiedSender: req.verifiedSender ?? email.verifiedSender,
        };
      }
      return {
        id: req.message.messageId,
        from: req.sender,
        email: req.sender,
        subject: "Unknown Sender Request",
        preview: req.proofSummary || "Pending postage decision",
        body: "Message details will load once decided.",
        time: new Date(req.createdAt).toLocaleDateString(),
        unread: true,
        starred: false,
        folder: "requests" as const,
        requestId: req.requestId,
        postageAmount: req.postageAmount,
        verifiedSender: req.verifiedSender,
      };
    });
  }, [emails, liveRequests, isDemoMode]);

  // The failure simulation toggle is a QA-only control: it never renders in
  // production builds, so shipped code audits against the live data path.
  const showSimulationToggle = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;

  const closeInspector = useCallback(() => setInspectEmail(null), []);
  const inspectorRef = useFocusTrap(inspectEmail !== null, closeInspector);

  const getCardStatus = (emailId: string): CardStatus => {
    return cardStates[emailId]?.status ?? "idle";
  };

  const setCardStatus = (emailId: string, status: CardStatus) => {
    setCardStates((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], emailId, status },
    }));
  };

  // Triggering the action (approve_once/always_allow/reject/block) -> starts the pending state
  const handleTriggerAction = async (emailId: string, action: TriageAction) => {
    const email = requests.find((e) => e.id === emailId);
    if (!email) return;

    const pendingStatus = `pending-${action}` as CardStatus;
    setCardStatus(emailId, pendingStatus);

    try {
      if (isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (simulateFailure) throw new Error("Simulated network transaction failed");
      } else {
        const requestId = (email as any).requestId;
        if (!requestId) throw new Error("Request ID not found for message");
        await decisionMutation.mutateAsync({ requestId, decision: action });
      }

      const successStatus = `success-${action}` as CardStatus;
      setCardStatus(emailId, successStatus);
      onShowToast(`Decision ${action} registered successfully.`, {
        tone: "neutral",
      });
    } catch (err: any) {
      setCardStatus(emailId, "failure");
      onShowToast(err.message || `Failed to apply ${action}`, {
        tone: "danger",
      });
    }
  };

  // Undo triggers a loading revert state, then goes back to idle
  const handleUndoAction = (emailId: string) => {
    setCardStatus(emailId, "undoing");
    setTimeout(() => {
      setCardStatus(emailId, "idle");
      onShowToast("Changes reverted successfully", { tone: "success" });
    }, 600);
  };

  // Finalizing triggers the actual folder state transition
  const handleFinalizeAction = (emailId: string, action: TriageAction) => {
    const email = emails.find((e) => e.id === emailId);
    if (!email) return;

    const cleanLabels = (labels?: string[], toAdd?: string) => {
      const filterOut = new Set(["Request", "Paid", "Pending"]);
      const current = labels ? labels.filter((l) => !filterOut.has(l)) : [];
      return toAdd ? [...current, toAdd] : current;
    };

    if (action === "always_allow") {
      onUpdateEmail(emailId, {
        folder: "inbox",
        senderPolicy: "allow",
        labels: cleanLabels(email.labels, "Trusted"),
      });
      onShowToast(`${email.from} added to Trusted Contacts. Mail moved to Inbox.`, {
        tone: "success",
      });
    } else if (action === "approve_once") {
      onUpdateEmail(emailId, {
        folder: "inbox",
        labels: cleanLabels(email.labels, "Approved Once"),
      });
      onShowToast(`Message from ${email.from} approved once and moved to Inbox.`, {
        tone: "success",
      });
    } else if (action === "block") {
      onUpdateEmail(emailId, {
        folder: "spam",
        senderPolicy: "block",
        labels: cleanLabels(email.labels, "Blocked"),
      });
      onShowToast(`${email.from} blocked. Mail moved to Spam.`, {
        tone: "danger",
      });
    } else if (action === "reject") {
      onUpdateEmail(emailId, {
        folder: "spam",
        labels: cleanLabels(email.labels, "Refunded"),
      });
      onShowToast(`Postage refunded for message from ${email.from}.`, {
        tone: "success",
      });
    }

    // Clean up local card state
    setCardStates((prev) => {
      const next = { ...prev };
      delete next[emailId];
      return next;
    });

    // Remove from liveRequests list
    setLiveRequests((prev) => prev.filter((r) => r.message.messageId !== emailId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });
  };

  const handleToggleSelect = (emailId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(requests.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const executeBulkAction = async (action: TriageAction) => {
    setBulkAction(null);
    const ids = [...selectedIds];
    setBulkProcessing({
      action,
      total: ids.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
    });

    for (const emailId of ids) {
      const email = requests.find((e) => e.id === emailId);
      if (!email) continue;

      const pendingStatus = `pending-${action}` as CardStatus;
      setCardStatus(emailId, pendingStatus);

      try {
        if (isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (simulateFailure) throw new Error("Simulated network transaction failed");
        } else {
          const requestId = (email as any).requestId;
          if (!requestId) throw new Error("Request ID not found");
          await decisionMutation.mutateAsync({ requestId, decision: action });
        }

        const successStatus = `success-${action}` as CardStatus;
        setCardStatus(emailId, successStatus);

        setBulkProcessing((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            processed: prev.processed + 1,
            succeeded: prev.succeeded + 1,
          };
        });
      } catch (err: any) {
        setCardStatus(emailId, "failure");
        setBulkProcessing((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            processed: prev.processed + 1,
            failed: prev.failed + 1,
            failures: [...prev.failures, { sender: email.from, error: err.message || "Failed" }],
          };
        });
      }
    }
  };

  return (
    <div className="mail-list-atmosphere relative m-3 flex h-[calc(100vh-3.5rem-1.5rem)] flex-1 flex-col overflow-hidden rounded-lg border border-surface-tint/10 bg-surface-recessed/20 backdrop-blur-sm">
      {/* Triage Board Header */}
      <div className="relative z-10 flex flex-col justify-between gap-3 border-b border-surface-tint/10 bg-surface-tint/2.5 px-4 py-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-highlight" />
            <h2 className="text-sm font-semibold tracking-normal text-foreground">
              Request Triage Board
            </h2>
            <span className="rounded-full bg-surface-tint/8 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {requests.length} pending
            </span>
            {requests.length > 0 && (
              <label className="flex items-center gap-1.5 ml-4 text-xs text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === requests.length && requests.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-surface-tint/20 bg-surface-recessed/40 text-status-success dark:text-emerald-500 focus:ring-emerald-500/30"
                />
                <span>Select All</span>
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Approve once, always allow, reject, or block unknown senders from a unified interface.
          </p>
        </div>

        {/* QA Control panel (development builds only) */}
        {showSimulationToggle && (
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none hover:text-foreground transition">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
                className="rounded border-surface-tint/20 bg-surface-recessed/40 text-status-success dark:text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 focus:outline-none"
              />
              <span>Simulate network failure</span>
            </label>
          </div>
        )}
      </div>

      {/* Main Cards Area */}
      <div className="scrollbar-thin relative z-10 flex-1 overflow-y-auto p-4 md:p-6">
        {isRequestsLoading && requests.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2.5">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading pending requests...</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {requests.length === 0 ? (
              <motion.div
                key="empty-state"
                {...motionPresets.entrance.scaleIn(0.98)}
                className="flex h-[300px] flex-col items-center justify-center text-center p-6"
              >
                <div className="mb-4 rounded-full bg-emerald-500/10 p-3 text-status-success dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">All caught up!</h3>
                <p className="max-w-[280px] text-xs text-muted-foreground mt-1 leading-normal">
                  There are no pending sender requests awaiting review. Your inbox policy is working
                  perfectly.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-6">
                <motion.div
                  key="cards-grid"
                  className="grid grid-cols-1 gap-4 lg:grid-cols-2"
                  layout
                >
                  {requests.map((email) => (
                    <motion.div key={email.id} layout className="relative">
                      <RequestCard
                        email={email}
                        status={getCardStatus(email.id)}
                        simulateFailure={simulateFailure}
                        onTriggerAction={handleTriggerAction}
                        onUndoAction={handleUndoAction}
                        onFinalizeAction={handleFinalizeAction}
                        onInspect={setInspectEmail}
                        isSelected={selectedIds.has(email.id)}
                        onToggleSelect={() => handleToggleSelect(email.id)}
                      />
                    </motion.div>
                  ))}
                </motion.div>

                {nextCursor && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setCursor(nextCursor)}
                      className="rounded-lg border border-surface-tint/10 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-tint/5 transition"
                    >
                      Load More Requests
                    </button>
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-20 md:bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] flex-wrap md:flex-nowrap -translate-x-1/2 items-center gap-2 sm:gap-4 rounded-xl border border-surface-tint/10 bg-surface-recessed/90 px-3 sm:px-6 py-2.5 sm:py-3 shadow-2xl backdrop-blur-md"
          >
            <span className="text-xs text-foreground/80 font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="hidden sm:block h-4 w-px bg-surface-tint/10" />
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setBulkAction("block")}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs font-medium text-status-danger dark:text-red-400 hover:bg-red-500/10 transition"
              >
                Bulk Block
              </button>
              <button
                onClick={() => setBulkAction("reject")}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs font-medium text-status-warning dark:text-amber-400 hover:bg-amber-500/10 transition"
              >
                Bulk Reject
              </button>
              <button
                onClick={() => setBulkAction("approve_once")}
                className="rounded-lg border border-surface-tint/10 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-tint/5 transition"
              >
                Approve Once
              </button>
              <button
                onClick={() => setBulkAction("always_allow")}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 transition"
              >
                Always Allow
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition ml-2"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Action Confirmation Modal */}
      <AnimatePresence>
        {bulkAction && (
          <>
            <motion.div
              {...motionPresets.patterns.modal.backdrop}
              onClick={() => setBulkAction(null)}
              className="fixed inset-0 z-100 bg-surface-recessed/80 backdrop-blur-md"
            />
            <motion.div
              {...motionPresets.patterns.modal.content}
              role="dialog"
              aria-modal="true"
              className="glass-strong fixed left-1/2 top-1/2 z-101 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-surface-tint/10 p-6"
            >
              <div className="flex items-start gap-3 text-status-warning dark:text-amber-400 mb-3">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Confirm Bulk Action</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-normal mb-4">
                Are you sure you want to perform <strong>{bulkAction.replace("_", " ")}</strong> for
                the {selectedIds.size} selected sender request{selectedIds.size > 1 ? "s" : ""}?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setBulkAction(null)}
                  className="rounded-lg border border-surface-tint/10 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-tint/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeBulkAction(bulkAction)}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:opacity-90 transition"
                >
                  Confirm Action
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bulk Processing Progress & Failure Report Modal */}
      <AnimatePresence>
        {bulkProcessing && (
          <>
            <div className="fixed inset-0 z-100 bg-surface-recessed/80 backdrop-blur-md" />
            <motion.div
              {...motionPresets.patterns.modal.content}
              role="dialog"
              aria-modal="true"
              className="glass-strong fixed left-1/2 top-1/2 z-101 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-surface-tint/10 p-6"
            >
              <h3 className="text-sm font-bold text-foreground mb-4">
                Bulk Processing: {bulkProcessing.action.replace("_", " ")}
              </h3>

              {bulkProcessing.processed < bulkProcessing.total ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-status-success dark:text-emerald-400" />
                    <span className="text-xs text-foreground/90 font-medium">
                      Processing {bulkProcessing.processed} of {bulkProcessing.total}...
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface-tint/5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${(bulkProcessing.processed / bulkProcessing.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs rounded-lg bg-surface-tint/2 border border-surface-tint/5 p-3">
                    <div>
                      <span className="text-muted-foreground">Succeeded</span>
                      <span className="block font-semibold text-status-success dark:text-emerald-400 mt-0.5">
                        {bulkProcessing.succeeded} items
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed</span>
                      <span className="block font-semibold text-status-danger dark:text-rose-400 mt-0.5">
                        {bulkProcessing.failed} items
                      </span>
                    </div>
                  </div>

                  {bulkProcessing.failures.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Failure Details
                      </span>
                      <div className="max-h-[140px] overflow-y-auto rounded-lg border border-surface-tint/5 bg-surface-recessed/20 p-2 space-y-2">
                        {bulkProcessing.failures.map((f, i) => (
                          <div
                            key={i}
                            className="text-[11px] leading-normal border-b border-surface-tint/4 pb-1 last:border-b-0 last:pb-0"
                          >
                            <span className="font-mono text-foreground/90 block truncate">
                              {f.sender}
                            </span>
                            <span className="text-status-danger dark:text-rose-400">{f.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        setBulkProcessing(null);
                        setSelectedIds(new Set());
                      }}
                      className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90 transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* CONTEXT INSPECTOR MODAL */}
      <AnimatePresence>
        {inspectEmail && (
          <>
            {/* Backdrop */}
            <motion.div
              {...motionPresets.patterns.modal.backdrop}
              onClick={closeInspector}
              aria-hidden="true"
              className="fixed inset-0 z-100 bg-surface-recessed/80 backdrop-blur-md"
            />

            {/* Panel */}
            <motion.div
              {...motionPresets.patterns.modal.content}
              ref={inspectorRef}
              role="dialog"
              aria-modal="true"
              aria-label="Inspect sender request context"
              className="glass-strong fixed left-1/2 top-1/2 z-101 w-[min(540px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-surface-tint/10"
            >
              <div className="flex items-start justify-between border-b border-surface-tint/8 px-6 py-4">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Sender Inspection
                  </span>
                  <h3 className="text-sm font-bold text-foreground mt-0.5 truncate max-w-[360px]">
                    {inspectEmail.from}
                  </h3>
                </div>
                <button
                  onClick={closeInspector}
                  className="rounded-lg p-1 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
                  aria-label="Close details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-tint/2 border border-surface-tint/4 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block">Stellar ID</span>
                    <span className="font-mono text-[10px] break-all block mt-0.5 text-foreground/90">
                      {inspectEmail.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Verification</span>
                    {inspectEmail.verifiedSender ? (
                      <span className="inline-flex items-center gap-1 text-status-success dark:text-emerald-400 font-medium mt-0.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified cryptographic key
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-status-warning dark:text-amber-400 font-medium mt-0.5">
                        <HelpCircle className="h-3.5 w-3.5" />
                        Self-declared identity (Unverified)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">
                      Postage Attached
                    </span>
                    <span className="font-semibold text-foreground mt-0.5 block">
                      {inspectEmail.postageAmount
                        ? `${Number(inspectEmail.postageAmount) / 10_000_000} XLM`
                        : "0.0 XLM"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Security Status</span>
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning dark:text-amber-400 mt-0.5">
                      Quarantined (Requests folder)
                    </span>
                  </div>
                </div>

                {/* Email Body */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground block">
                    Message Preview
                  </span>
                  <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/20 p-4 space-y-3">
                    <div className="border-b border-surface-tint/6 pb-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Subject
                      </span>
                      <h4 className="text-xs font-bold text-foreground mt-0.5">
                        {inspectEmail.subject}
                      </h4>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                        Body Content
                      </span>
                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {inspectEmail.body}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Attachments if any */}
                {inspectEmail.attachments && inspectEmail.attachments.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      Attachments ({inspectEmail.attachments.length})
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {inspectEmail.attachments.map((file, i) => (
                        <div
                          key={`${file.name}-${file.size}`}
                          className="flex items-center gap-2 rounded-lg border border-surface-tint/5 bg-surface-tint/1 p-2 text-[11px]"
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground/90">{file.name}</p>
                            <p className="text-[9px] text-muted-foreground">{file.size}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Inspector CTAs */}
              <div className="flex items-center justify-end gap-2 border-t border-surface-tint/8 px-6 py-4">
                <button
                  onClick={closeInspector}
                  className="rounded-lg border border-surface-tint/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-tint/5 focus:outline-none focus:ring-2 focus:ring-surface-tint/10"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
