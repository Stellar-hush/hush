import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingDraft } from "../types";

type Props = {
  draft: OnboardingDraft;
  mailboxAddress: string;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  onRetreat: () => void;
};

const RULE_LABELS: Record<string, string> = {
  request: "Hold for review",
  verified: "Verified senders only",
  block: "Trusted contacts only",
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-tint/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * Step 7: Policy review and activation (BETA-013)
 *
 * Summarizes every choice made during the flow and submits a single
 * POST /api/v1/onboarding/complete transaction to activate the mailbox.
 * Errors are surfaced inline so the user can retry without losing context.
 */
export function PolicyReviewStep({
  draft,
  mailboxAddress,
  isSubmitting,
  submitError,
  onSubmit,
  onRetreat,
}: Props) {
  const short = mailboxAddress ? `${mailboxAddress.slice(0, 8)}…${mailboxAddress.slice(-6)}` : "—";
  const postageDisplay = draft.minimumPostage === "0" ? "None" : `${draft.minimumPostage} XLM`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Review your mailbox policy</h2>
        <p className="text-sm text-muted-foreground">
          These settings will be written to the Hush protocol. You can update them at any time from
          Settings.
        </p>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-tint/[0.03] px-4 divide-y divide-surface-tint/5">
        <ReviewRow label="Display name" value={draft.displayName || "—"} />
        <ReviewRow label="Mailbox address" value={short} />
        <ReviewRow label="Unknown senders" value={RULE_LABELS[draft.unknownSenderRule] ?? "—"} />
        <ReviewRow label="Minimum postage" value={postageDisplay} />
        <ReviewRow label="Read receipts" value={draft.receiptOnDelivery ? "Enabled" : "Disabled"} />
      </div>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger dark:text-red-400" />
          <div className="space-y-1">
            <p className="text-sm text-status-danger dark:text-red-300">{submitError}</p>
            <p className="text-xs text-muted-foreground">
              Your settings are saved. Try activating again.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-surface-tint/10 bg-surface-tint/[0.02] p-3">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success dark:text-emerald-400" />
        <p className="text-xs text-muted-foreground">
          Activating writes your policy to the Hush server. No on-chain transaction fee is charged
          at this point.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetreat}
          disabled={isSubmitting}
          className={cn(
            "flex-1 rounded-xl border border-surface-tint/10 px-4 py-2.5 text-sm text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/30 active:scale-[0.99]",
            isSubmitting ? "opacity-40" : "hover:bg-surface-tint/[0.04] hover:text-foreground",
          )}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 active:scale-[0.99]",
            isSubmitting
              ? "cursor-not-allowed bg-surface-tint/10 text-muted-foreground"
              : "bg-foreground text-background hover:opacity-90",
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Activating…
            </span>
          ) : (
            "Activate mailbox"
          )}
        </button>
      </div>
    </div>
  );
}
