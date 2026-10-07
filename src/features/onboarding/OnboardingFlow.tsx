import { useEffect, useRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useOnboarding } from "./useOnboarding";
import { ProfileStep } from "./steps/ProfileStep";
import { HushAddressStep } from "./steps/HushAddressStep";
import { RecoveryStep } from "./steps/RecoveryStep";
import { UnknownSenderRulesStep } from "./steps/UnknownSenderRulesStep";
import { MinimumPostageStep } from "./steps/MinimumPostageStep";
import { ReceiptPreferenceStep } from "./steps/ReceiptPreferenceStep";
import { PolicyReviewStep } from "./steps/PolicyReviewStep";
import type { OnboardingDraft, OnboardingStep } from "./types";

type Props = {
  account: {
    displayName?: string | null;
    email?: string | null;
    username?: string;
  };
  mailboxAddress: string;
  onComplete: () => void | Promise<void>;
};

// Step transition: slides in from the direction of travel, exits opposite
const stepVariants = {
  enter: (direction: number) => ({ x: direction * 28, opacity: 0 }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: "easeOut" as const },
  },
  exit: (direction: number) => ({
    x: direction * -28,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" as const },
  }),
};

function ProgressBar({ stepIndex, totalSteps }: { stepIndex: number; totalSteps: number }) {
  return (
    <div
      className="flex items-center gap-3 px-6 pt-5 pb-1"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={stepIndex + 1}
      aria-label={"Step " + (stepIndex + 1) + " of " + totalSteps}
    >
      <div className="flex flex-1 gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="h-0.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i <= stepIndex ? "var(--primary)" : "var(--border)",
            }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
        {stepIndex + 1} / {totalSteps}
      </span>
    </div>
  );
}

function renderStep(step: OnboardingStep, props: StepProps): React.ReactNode {
  switch (step) {
    case "profile":
      return (
        <ProfileStep
          account={props.account}
          draft={props.draft}
          onUpdate={props.onUpdate}
          onAdvance={props.onAdvance}
        />
      );
    case "stealth-address":
      return (
        <HushAddressStep
          mailboxAddress={props.mailboxAddress}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      );
    case "recovery":
      return (
        <RecoveryStep
          draft={props.draft}
          onUpdate={props.onUpdate}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      );
    case "sender-policy":
      return (
        <UnknownSenderRulesStep
          draft={props.draft}
          onUpdate={props.onUpdate}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      );
    case "postage":
      return (
        <MinimumPostageStep
          draft={props.draft}
          onUpdate={props.onUpdate}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      );
    case "receipts":
      return (
        <ReceiptPreferenceStep
          draft={props.draft}
          onUpdate={props.onUpdate}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      );
    case "review":
      return (
        <PolicyReviewStep
          draft={props.draft}
          mailboxAddress={props.mailboxAddress}
          isSubmitting={props.isSubmitting}
          submitError={props.submitError}
          onSubmit={props.onSubmit}
          onRetreat={props.onRetreat}
        />
      );
  }
}

type StepProps = {
  account: Props["account"];
  mailboxAddress: string;
  draft: OnboardingDraft;
  isSubmitting: boolean;
  submitError: string | null;
  onAdvance: () => void;
  onRetreat: () => void;
  onUpdate: (patch: Partial<OnboardingDraft>) => void;
  onSubmit: () => void;
};

/**
 * OnboardingFlow (BETA-013)
 *
 * Full-page profile-first onboarding wizard. Identity is the authenticated
 * account (no wallet extension, no wallet address input anywhere) and every
 * transition is persisted to the server, so a refresh or a second device
 * resumes from the same authoritative state.
 */
export function OnboardingFlow({ account, mailboxAddress, onComplete }: Props) {
  const onboarding = useOnboarding({ onComplete: () => onComplete() });

  const panelRef = useRef<HTMLDivElement>(null);

  // Accessibility: move focus into the flow when it mounts and on step change.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
  }, [onboarding.step]);

  if (onboarding.completed) {
    return (
      <main className="ambient-bg flex min-h-screen items-center justify-center p-4 sm:p-6">
        <div className="glass-strong w-[min(480px,calc(100vw-2rem))] rounded-2xl p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 size-10 text-status-success dark:text-emerald-400" />
          <h1 className="text-lg font-semibold text-foreground">You&apos;re all set</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your mailbox policy is active. Opening your inbox…
          </p>
          <Loader2 className="mx-auto mt-4 size-4 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  const stepProps: StepProps = {
    account,
    mailboxAddress,
    draft: onboarding.draft,
    isSubmitting: onboarding.isSubmitting,
    submitError: onboarding.submitError,
    onAdvance: () => onboarding.advance(),
    onRetreat: () => onboarding.retreat(),
    onUpdate: onboarding.update,
    onSubmit: () => {
      void onboarding.submit().catch(() => undefined);
    },
  };

  return (
    <main className="ambient-bg flex min-h-screen items-center justify-center p-4 sm:p-6">
      <MotionConfig reducedMotion="user">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Account setup"
          className="glass-strong w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-2xl"
        >
          <ProgressBar stepIndex={onboarding.stepIndex} totalSteps={onboarding.totalSteps} />

          {onboarding.isRestoring && (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading your saved progress…
            </div>
          )}

          {!onboarding.isRestoring && onboarding.restoreError && (
            <div className="px-6">
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning dark:text-amber-300" />
                <p className="text-xs text-status-warning dark:text-amber-200">
                  {onboarding.restoreError}
                </p>
              </div>
            </div>
          )}

          {!onboarding.isRestoring && (
            <div className="overflow-hidden px-6 pb-6 pt-4">
              <AnimatePresence mode="wait" custom={onboarding.direction}>
                <motion.div
                  key={onboarding.step}
                  custom={onboarding.direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {renderStep(onboarding.step, stepProps)}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </MotionConfig>
    </main>
  );
}
