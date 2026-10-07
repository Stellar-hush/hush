import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OnboardingDraft } from "../types";

type Props = {
  draft: OnboardingDraft;
  onUpdate: (patch: Partial<OnboardingDraft>) => void;
  onAdvance: () => void;
  onRetreat: () => void;
};

const ACKNOWLEDGMENTS = [
  "I have secured access to my account recovery in a safe location.",
  "I understand that losing recovery access means permanent loss of access to my mailbox.",
] as const;

/**
 * Step 3: Recovery acknowledgment (BETA-013)
 *
 * Both checkboxes must be checked to unlock "Continue". The acknowledgment is
 * persisted to the server-backed draft so a refresh can never silently reset
 * it to "not acknowledged".
 */
export function RecoveryStep({ draft, onUpdate, onAdvance, onRetreat }: Props) {
  const acknowledged = draft.recoveryAcknowledged;
  const [checked, setChecked] = useState<boolean[]>([acknowledged, acknowledged]);

  const allChecked = checked.every(Boolean);

  function toggle(index: number) {
    setChecked((prev) => {
      const next = prev.map((v, i) => (i === index ? !v : v));
      onUpdate({ recoveryAcknowledged: next.every(Boolean) });
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Secure your recovery</h2>
        <p className="text-sm text-muted-foreground">
          Recovery access protects your Hush mailbox. Anyone who gains it can impersonate you.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning dark:text-amber-300" />
        <p className="text-xs text-status-warning dark:text-amber-200">
          Hush has no account recovery system. If you lose your recovery access, your mailbox
          address and all associated mail history become permanently inaccessible.
        </p>
      </div>

      <div className="space-y-3">
        {ACKNOWLEDGMENTS.map((label, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={checked[index]}
            onClick={() => toggle(index)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              "active:scale-[0.99]",
              checked[index]
                ? "border-emerald-400/30 bg-emerald-400/[0.06] ring-1 ring-emerald-400/30"
                : "border-surface-tint/10 bg-surface-tint/[0.025] hover:bg-surface-tint/[0.05]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                checked[index]
                  ? "border-emerald-400/40 bg-emerald-400/20"
                  : "border-surface-tint/20 bg-surface-tint/[0.04]",
              )}
            >
              {checked[index] && (
                <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-emerald-300">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              )}
            </span>
            <span className="text-sm text-foreground">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetreat}
          className="flex-1 rounded-xl border border-surface-tint/10 px-4 py-2.5 text-sm text-muted-foreground transition hover:bg-surface-tint/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/30 active:scale-[0.99]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={!allChecked}
          className={cn(
            "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 active:scale-[0.99]",
            allChecked
              ? "bg-foreground text-background hover:opacity-90"
              : "cursor-not-allowed bg-surface-tint/10 text-muted-foreground",
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
