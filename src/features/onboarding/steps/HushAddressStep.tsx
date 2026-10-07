import { Check, Copy, Mail } from "lucide-react";
import { useState } from "react";

type Props = {
  mailboxAddress: string;
  onAdvance: () => void;
  onRetreat: () => void;
};

/**
 * Step 2: Hush address (BETA-013)
 *
 * The account's mailbox address is issued by the server — it is not a
 * wallet extension address. Provides a copy button so the address can be
 * shared with contacts.
 */
export function HushAddressStep({ mailboxAddress, onAdvance, onRetreat }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(mailboxAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Show first 8 and last 6 characters with ellipsis for the label
  const short = `${mailboxAddress.slice(0, 8)}…${mailboxAddress.slice(-6)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Your mailbox address</h2>
        <p className="text-sm text-muted-foreground">
          Your Hush address is issued with your account. Share it with senders so they can deliver
          mail to you on-chain.
        </p>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-tint/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          <span className="text-xs uppercase tracking-wide">Hush address</span>
        </div>
        <p className="font-mono text-sm text-foreground break-all leading-relaxed">
          {mailboxAddress}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/30"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-status-success dark:text-emerald-400" />
              <span className="text-status-success dark:text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy {short}
            </>
          )}
        </button>
      </div>

      <div className="rounded-xl border border-surface-tint/10 bg-surface-tint/[0.025] p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">How this address works</p>
        <ul className="space-y-1.5">
          {[
            "Senders use this address to look up your mailbox policy.",
            "Postage payments are routed to your Stellar account.",
            "Delivery proofs are anchored on the Stellar ledger.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
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
          className="flex-1 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 active:scale-[0.99]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
