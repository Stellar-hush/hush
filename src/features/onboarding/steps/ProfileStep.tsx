import { Mail, User } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OnboardingDraft } from "../types";

type Props = {
  account: {
    displayName?: string | null;
    email?: string | null;
    username?: string;
  };
  draft: OnboardingDraft;
  onUpdate: (patch: Partial<OnboardingDraft>) => void;
  onAdvance: () => void;
};

/**
 * Step 1: Profile (BETA-013)
 *
 * Identity comes from the authenticated account — no wallet connection is
 * involved. The display name is editable; the email is read-only.
 */
export function ProfileStep({ account, draft, onUpdate, onAdvance }: Props) {
  const [displayName, setDisplayName] = useState(
    draft.displayName.trim() || account.displayName?.trim() || "",
  );
  const [error, setError] = useState<string | null>(null);

  const email = account.email ?? "";
  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setError(null);
    onUpdate({ displayName: value });
  };

  function handleContinue() {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("Enter a display name to continue.");
      return;
    }
    onUpdate({ displayName: trimmed });
    onAdvance();
  }

  const canAdvance = displayName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Your profile</h2>
        <p className="text-sm text-muted-foreground">
          This is the account Hush uses for your mailbox. No wallet connection is needed.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="profile-display-name"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          Display name
        </label>
        <input
          id="profile-display-name"
          autoFocus
          value={displayName}
          onChange={(e) => handleDisplayNameChange(e.target.value)}
          placeholder={account.displayName?.trim() || account.username || "Your name"}
          aria-invalid={error !== null}
          className={cn(
            "w-full rounded-xl border bg-surface-tint/[0.04] px-3 py-2.5 text-sm text-foreground outline-none transition",
            error
              ? "border-red-400/40 focus:border-red-400/60"
              : "border-surface-tint/10 focus:border-surface-tint/20",
          )}
        />
        {error && <p className="text-xs text-status-danger dark:text-red-400">{error}</p>}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-surface-tint/10 bg-surface-tint/[0.02] px-3 py-2.5">
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
          <p className="truncate text-sm text-foreground">{email || "—"}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canAdvance}
        className={cn(
          "flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 active:scale-[0.99]",
          canAdvance
            ? "bg-foreground text-background hover:opacity-90"
            : "cursor-not-allowed bg-surface-tint/10 text-muted-foreground",
        )}
      >
        Continue
      </button>
    </div>
  );
}
