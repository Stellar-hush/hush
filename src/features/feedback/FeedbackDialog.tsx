/**
 * FeedbackDialog — beta tester defect reporting UI (Issue #2001 — BETA-094).
 *
 * Design principles:
 * - User can see exactly what diagnostic data will be sent (preview step).
 * - Message content, tokens, private keys, and raw address books are
 *   NEVER included — the form collects only steps and optional diagnostics.
 * - Screenshot capture requires an explicit opt-in checkbox.
 * - Submission is rate-limited server-side; the UI surfaces the error clearly.
 */

import { useState, useCallback } from "react";
import {
  Bug,
  X,
  ChevronRight,
  ChevronLeft,
  Eye,
  Send,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Camera,
  Shield,
} from "lucide-react";

declare const __APP_VERSION__: string | undefined;

export type FeedbackCategory =
  | "bug"
  | "performance"
  | "ui"
  | "security"
  | "feature_request"
  | "other";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";

interface FeedbackDiagnostics {
  appVersion?: string;
  userAgent?: string;
  route?: string;
  featureFlags?: Record<string, boolean>;
  supportId?: string;
  serviceStatus?: Record<string, string>;
}

interface FeedbackSubmitInput {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  steps: string;
  screenshotConsent: boolean;
  screenshotDataUrl?: string | null;
  diagnostics?: FeedbackDiagnostics | null;
}

interface PreviewPayload {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  steps: string;
  screenshotConsent: boolean;
  screenshotDataUrl: string | null;
  diagnostics: FeedbackDiagnostics | null;
  reporterId: string;
  triageNotes: null;
}

type Step = "form" | "preview" | "done";

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string }[] = [
  { value: "bug", label: "Bug Report", icon: "🐛" },
  { value: "performance", label: "Performance Issue", icon: "⚡" },
  { value: "ui", label: "UI / UX Problem", icon: "🎨" },
  { value: "security", label: "Security Concern", icon: "🔒" },
  { value: "feature_request", label: "Feature Request", icon: "✨" },
  { value: "other", label: "Other", icon: "💬" },
];

const SEVERITIES: { value: FeedbackSeverity; label: string; color: string }[] = [
  {
    value: "low",
    label: "Low",
    color: "text-status-info dark:text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
  {
    value: "medium",
    label: "Medium",
    color: "text-status-warning dark:text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  },
  {
    value: "high",
    label: "High",
    color: "text-status-warning dark:text-orange-400 border-orange-500/30 bg-orange-500/10",
  },
  {
    value: "critical",
    label: "Critical",
    color: "text-status-danger dark:text-red-400 border-red-500/30 bg-red-500/10",
  },
];

function collectDiagnostics(): FeedbackDiagnostics {
  return {
    appVersion: typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : "unknown",
    userAgent: navigator.userAgent.slice(0, 300),
    route: window.location.pathname,
    supportId: sessionStorage.getItem("stealth_support_id") ?? undefined,
  };
}

interface FeedbackDialogProps {
  onClose: () => void;
  initialRoute?: string;
}

export function FeedbackDialog({ onClose, initialRoute }: FeedbackDialogProps) {
  const [step, setStep] = useState<Step>("form");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [steps, setSteps] = useState("");
  const [screenshotConsent, setScreenshotConsent] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const captureScreenshot = useCallback(async () => {
    if (!screenshotConsent) return;
    try {
      // In a real implementation this would use html2canvas or the
      // Screen Capture API. We use a placeholder for the beta path.
      setScreenshotDataUrl("data:image/png;base64,SCREENSHOT_PLACEHOLDER");
    } catch {
      setScreenshotDataUrl(null);
    }
  }, [screenshotConsent]);

  const buildInput = (): FeedbackSubmitInput => ({
    category,
    severity,
    steps,
    screenshotConsent,
    screenshotDataUrl: screenshotConsent ? screenshotDataUrl : null,
    diagnostics: includeDiagnostics ? collectDiagnostics() : null,
  });

  const handlePreview = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const supportId = sessionStorage.getItem("stealth_support_id") ?? undefined;
      const res = await fetch("/api/v1/feedback?preview=true", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(supportId ? { "x-support-id": supportId } : {}),
        },
        body: JSON.stringify(buildInput()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Preview failed");
      setPreview(json.data.preview);
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const supportId = sessionStorage.getItem("stealth_support_id") ?? undefined;
      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(supportId ? { "x-support-id": supportId } : {}),
        },
        body: JSON.stringify(buildInput()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Submission failed");
      setReportId(json.data.report.reportId);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Beta Feedback Report"
      id="feedback-dialog"
    >
      <div className="w-full max-w-lg bg-card dark:bg-neutral-900 border border-border dark:border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-status-special dark:text-purple-400 rounded-lg">
              <Bug className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-status-neutral dark:text-neutral-100">
                Report a Problem
              </h2>
              <p className="text-[11px] text-muted-foreground dark:text-neutral-500">
                {step === "form" && "Step 1 of 2 — describe the issue"}
                {step === "preview" && "Step 2 of 2 — review before sending"}
                {step === "done" && "Report submitted"}
              </p>
            </div>
          </div>
          <button
            id="feedback-dialog-close"
            onClick={onClose}
            className="p-1.5 text-muted-foreground dark:text-neutral-500 hover:text-status-neutral dark:hover:text-neutral-200 hover:bg-accent dark:hover:bg-neutral-800 rounded-lg transition-all"
            aria-label="Close feedback dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Privacy notice — always visible */}
        <div className="mx-5 mt-4 px-3 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-lg flex items-start gap-2">
          <Shield className="size-3.5 text-status-success dark:text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-status-success/80 dark:text-emerald-300/80 leading-relaxed">
            Message content, tokens, and private keys are <strong>never collected</strong>. Only the
            metadata you see in the preview is sent.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === "form" && (
            <>
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-neutral-400 mb-2">
                  Category <span className="text-status-danger dark:text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      id={`feedback-category-${cat.value}`}
                      onClick={() => setCategory(cat.value)}
                      className={`px-3 py-2 text-left rounded-lg border text-xs transition-all flex items-center gap-1.5 ${
                        category === cat.value
                          ? "border-purple-500/60 bg-purple-500/10 text-status-special dark:text-purple-300"
                          : "border-border dark:border-neutral-800 text-muted-foreground dark:text-neutral-400 hover:border-border dark:hover:border-neutral-700 hover:text-status-neutral dark:hover:text-neutral-200"
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-neutral-400 mb-2">
                  Severity <span className="text-status-danger dark:text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev.value}
                      id={`feedback-severity-${sev.value}`}
                      onClick={() => setSeverity(sev.value)}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        severity === sev.value
                          ? sev.color
                          : "border-border dark:border-neutral-800 text-muted-foreground dark:text-neutral-500 hover:border-border dark:hover:border-neutral-700"
                      }`}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Steps */}
              <div>
                <label
                  htmlFor="feedback-steps"
                  className="block text-xs font-medium text-muted-foreground dark:text-neutral-400 mb-2"
                >
                  Steps to reproduce <span className="text-status-danger dark:text-red-400">*</span>
                  <span className="ml-1 text-muted-foreground dark:text-neutral-600">
                    (no message content or keys)
                  </span>
                </label>
                <textarea
                  id="feedback-steps"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="1. Open compose panel&#10;2. Click send&#10;3. See error in console..."
                  rows={5}
                  maxLength={2000}
                  className="w-full px-3 py-2.5 bg-background dark:bg-neutral-950 border border-border dark:border-neutral-800 rounded-lg text-sm text-status-neutral dark:text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-purple-500 resize-none transition-colors"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground dark:text-neutral-600">
                    Minimum 10 characters
                  </span>
                  <span className="text-[11px] text-muted-foreground dark:text-neutral-600">
                    {steps.length} / 2000
                  </span>
                </div>
              </div>

              {/* Screenshot consent */}
              <div className="p-3 bg-background dark:bg-neutral-950 border border-border dark:border-neutral-800 rounded-lg space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    id="feedback-screenshot-consent"
                    type="checkbox"
                    checked={screenshotConsent}
                    onChange={(e) => {
                      setScreenshotConsent(e.target.checked);
                      if (!e.target.checked) setScreenshotDataUrl(null);
                    }}
                    className="mt-0.5 accent-purple-500"
                  />
                  <span className="text-xs text-status-neutral dark:text-neutral-300">
                    I consent to including a screenshot of the current screen.
                    <span className="block text-[11px] text-muted-foreground dark:text-neutral-500 mt-0.5">
                      The screenshot will be reviewed by the Hush team only.
                    </span>
                  </span>
                </label>
                {screenshotConsent && (
                  <button
                    id="feedback-capture-screenshot"
                    onClick={captureScreenshot}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border border-border dark:border-neutral-700 hover:border-border dark:hover:border-neutral-600 text-muted-foreground dark:text-neutral-400 hover:text-status-neutral dark:hover:text-neutral-200 rounded-lg text-xs transition-all"
                  >
                    <Camera className="size-3.5" />
                    {screenshotDataUrl ? "Screenshot captured ✓" : "Capture screenshot"}
                  </button>
                )}
              </div>

              {/* Diagnostics consent */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  id="feedback-diagnostics-consent"
                  type="checkbox"
                  checked={includeDiagnostics}
                  onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                  className="mt-0.5 accent-purple-500"
                />
                <span className="text-xs text-status-neutral dark:text-neutral-300">
                  Include redacted diagnostics (app version, browser, current route, feature flags,
                  service status). No message content or credentials.
                </span>
              </label>
            </>
          )}

          {step === "preview" && preview && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground dark:text-neutral-400">
                This is exactly what will be sent. Review and confirm.
              </p>

              {[
                { label: "Category", value: preview.category },
                { label: "Severity", value: preview.severity },
                { label: "Steps", value: preview.steps },
                {
                  label: "Screenshot",
                  value: preview.screenshotDataUrl ? "Included (consented)" : "Not included",
                },
                { label: "Reporter token", value: preview.reporterId },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg bg-background dark:bg-neutral-950 border border-border dark:border-neutral-800 p-3"
                >
                  <div className="text-[11px] text-muted-foreground dark:text-neutral-500 mb-1">
                    {label}
                  </div>
                  <div className="text-xs text-status-neutral dark:text-neutral-200 font-mono break-all">
                    {value}
                  </div>
                </div>
              ))}

              {preview.diagnostics && (
                <div className="rounded-lg bg-background dark:bg-neutral-950 border border-border dark:border-neutral-800 p-3">
                  <div className="text-[11px] text-muted-foreground dark:text-neutral-500 mb-2">
                    Diagnostics
                  </div>
                  <pre className="text-[11px] text-muted-foreground dark:text-neutral-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(preview.diagnostics, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="p-4 bg-emerald-500/10 text-status-success dark:text-emerald-400 rounded-full">
                <CheckCircle2 className="size-8" />
              </div>
              <div>
                <h3 className="font-semibold text-status-neutral dark:text-neutral-100">
                  Report submitted
                </h3>
                <p className="text-xs text-muted-foreground dark:text-neutral-400 mt-1">
                  Thank you for your feedback. Our team will review it shortly.
                </p>
              </div>
              {reportId && (
                <div className="px-3 py-2 bg-background dark:bg-neutral-950 border border-border dark:border-neutral-800 rounded-lg text-[11px] font-mono text-muted-foreground dark:text-neutral-500 break-all">
                  Report ID: {reportId}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-status-danger dark:text-red-400">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step !== "done" && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border dark:border-neutral-800">
            {step === "preview" ? (
              <button
                id="feedback-back"
                onClick={() => setStep("form")}
                className="flex items-center gap-1.5 px-4 py-2 text-muted-foreground dark:text-neutral-400 hover:text-status-neutral dark:hover:text-neutral-200 text-xs transition-all"
              >
                <ChevronLeft className="size-3.5" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step === "form" && (
              <button
                id="feedback-preview"
                onClick={handlePreview}
                disabled={steps.length < 10 || submitting}
                className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Eye className="size-3.5" />
                )}
                Preview before sending
                <ChevronRight className="size-3.5" />
              </button>
            )}

            {step === "preview" && (
              <button
                id="feedback-submit"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send report
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
