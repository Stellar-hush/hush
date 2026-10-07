import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Download, RefreshCw, ShieldCheck } from "lucide-react";

import {
  recoveryRegenerateResponseSchema,
  recoveryStatusSchema,
  type RecoveryStatus,
} from "./recovery";

/**
 * Issue #1917 (BETA-010): recovery-code status + regeneration surface for the
 * Security settings tab.
 *
 * - Status is a safety screen: it reports whether recovery is set up, how many
 *   codes remain, and when the set was generated — it never exposes code
 *   material.
 * - Codes are shown exactly once, immediately after regeneration, with copy
 *   and download affordances. After the dialog closes the codes are gone.
 */
export function RecoveryCodesSection() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/recovery/status", {
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Unable to load recovery status.");
        setStatus(null);
        return;
      }
      setStatus(recoveryStatusSchema.parse(data.data));
    } catch {
      setError("Unable to connect. Please try again.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleRegenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/recovery/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "We could not regenerate your recovery codes.");
        setConfirmOpen(false);
        return;
      }
      const payload = recoveryRegenerateResponseSchema.parse(data.data);
      setCodes(payload.codes);
      setConfirmOpen(false);
      await refreshStatus();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const downloadCodes = () => {
    if (!codes) return;
    const content = [
      "Hush Mail - one-time recovery codes",
      `Generated: ${new Date().toISOString()}`,
      "",
      ...codes.map((code, index) => `${index + 1}. ${code}`),
      "",
      "Each code can be used exactly once to recover your account.",
      "Store these codes somewhere safe and offline.",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "stealth-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyCodes = async () => {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const primaryActionLabel =
    status === null || status.status === "none"
      ? "Generate recovery codes"
      : "Regenerate recovery codes";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Account recovery</p>
          <p className="text-xs text-muted-foreground">
            Backup access to your account if you lose access
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-surface-tint/5 bg-surface-tint/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status?.status === "none" ? (
              <div className="h-2 w-2 rounded-full bg-amber-400" />
            ) : status?.status === "active" ? (
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-rose-400" />
            )}
            <p className="text-xs font-medium text-foreground">
              {loading
                ? "Loading recovery status…"
                : status?.status === "none"
                  ? "Recovery not set up"
                  : status?.status === "active"
                    ? "Recovery enabled"
                    : "All recovery codes used"}
            </p>
          </div>
          {status && status.generatedAt && (
            <span className="text-xs text-muted-foreground">
              Generated {new Date(status.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {status && status.status !== "none" && (
          <p className="text-xs text-muted-foreground">
            {status.status === "active" && status.totalCodes === status.remainingCodes
              ? `${status.totalCodes} saved codes available — each can be used once.`
              : `${status.remainingCodes} of ${status.totalCodes} codes remain.`}
          </p>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-status-danger dark:text-rose-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {error}
          </p>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={loading || generating}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] px-3 py-2 text-xs text-foreground hover:bg-surface-tint/[0.06] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {generating ? "Generating…" : primaryActionLabel}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-recessed/70 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-sm rounded-2xl p-5 space-y-4">
            <h4 className="text-sm font-medium text-foreground">{primaryActionLabel}?</h4>
            <p className="text-xs text-muted-foreground">
              Existing codes become invalid, and every other signed-in device will be logged out.
              Your current session stays active. You must have signed in recently to regenerate
              codes.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2 text-xs text-foreground hover:bg-surface-tint/[0.06] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRegenerate()}
                disabled={generating}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {generating ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {codes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-recessed/70 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-lg rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Your new recovery codes</h4>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-status-warning dark:text-amber-400">
                Shown once
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Save these codes now. Each one can be used exactly once to recover your account, and
              they will never be shown again.
            </p>
            <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-surface-tint/10 bg-surface-recessed/30 p-3 font-mono text-[11px] text-foreground">
              {codes.map((code, index) => (
                <div key={`${code}-${index}`} className="flex items-center justify-between">
                  <span>{code}</span>
                  <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void copyCodes()}
                className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2 text-xs text-foreground hover:bg-surface-tint/[0.06] transition"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 inline h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 inline h-3 w-3" />
                    Copy all
                  </>
                )}
              </button>
              <button
                onClick={downloadCodes}
                className="flex-1 rounded-lg border border-surface-tint/10 px-4 py-2 text-xs text-foreground hover:bg-surface-tint/[0.06] transition"
              >
                <Download className="mr-1 inline h-3 w-3" />
                Download
              </button>
              <button
                onClick={() => setCodes(null)}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition"
              >
                I saved these codes
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && status?.status === "active" && (
        <p className="text-[11px] text-muted-foreground">
          <RefreshCw className="mr-1 inline h-3 w-3" />
          Regenerating requires a recent login and signs out your other devices.
        </p>
      )}
    </div>
  );
}
