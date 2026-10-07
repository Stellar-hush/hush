import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipientReadiness } from "./composeValidation";

export type RelayStatus = "healthy" | "degraded" | "failing" | "unknown";

export interface DeliveryEstimatorProps {
  recipients: RecipientReadiness[];
  encrypted: boolean;
  postage: string;
  relayStatus: RelayStatus;
  onAddPostage?: () => void;
  onResolveIdentity?: () => void;
}

interface CheckItem {
  id: string;
  label: string;
  status: "ok" | "warn" | "error" | "pending";
  detail?: string;
  cta?: { label: string; action: () => void };
}

function StatusIcon({ status }: { status: CheckItem["status"] }) {
  if (status === "ok")
    return (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success dark:text-emerald-400" />
    );
  if (status === "error")
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-danger dark:text-red-400" />;
  if (status === "warn")
    return <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-status-warning dark:text-amber-400" />;
  return (
    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-status-info dark:text-blue-400" />
  );
}

function overallStatus(checks: CheckItem[]): "ready" | "blocked" | "warning" | "pending" {
  if (checks.some((c) => c.status === "error")) return "blocked";
  if (checks.some((c) => c.status === "pending")) return "pending";
  if (checks.some((c) => c.status === "warn")) return "warning";
  return "ready";
}

export function DeliveryEstimator({
  recipients,
  encrypted,
  postage,
  relayStatus,
  onAddPostage,
  onResolveIdentity,
}: DeliveryEstimatorProps) {
  if (!recipients.length) return null;

  const hasBlocked = recipients.some((r) => r.state === "blocked" || r.state === "invalid");
  const hasUnresolved = recipients.some((r) => r.state === "resolving");
  const hasUnknown = recipients.some((r) => r.state === "unknown");
  const postageNeeded = recipients.some((r) => r.postage === "required");
  const missingKey = recipients.some(
    (r) => encrypted && !r.encryptionKey && r.state === "verified",
  );

  const checks: CheckItem[] = [
    // Identity check
    {
      id: "identity",
      label: "Recipient identity",
      status: hasBlocked ? "error" : hasUnresolved ? "pending" : hasUnknown ? "warn" : "ok",
      detail: hasBlocked
        ? "One or more recipients are blocked"
        : hasUnresolved
          ? "Resolving addresses…"
          : hasUnknown
            ? "Unverified — no Hush account found"
            : `${recipients.length} recipient${recipients.length > 1 ? "s" : ""} verified`,
      cta:
        hasUnknown && onResolveIdentity
          ? { label: "Request approval", action: onResolveIdentity }
          : undefined,
    },
    // Encryption key check
    {
      id: "encryption",
      label: "Encryption key",
      status: !encrypted ? "ok" : missingKey ? "warn" : "ok",
      detail: !encrypted
        ? "Encryption disabled"
        : missingKey
          ? "Key unavailable for one or more recipients"
          : "Keys ready",
    },
    // Postage check
    {
      id: "postage",
      label: "Postage",
      status: postageNeeded ? "warn" : Number.parseFloat(postage) > 0 ? "ok" : "ok",
      detail: postageNeeded
        ? "Recipient policy requires postage"
        : Number.parseFloat(postage) > 0
          ? `${postage} XLM attached`
          : "No postage (allowed)",
      cta:
        postageNeeded && onAddPostage ? { label: "Set postage", action: onAddPostage } : undefined,
    },
    // Relay check
    {
      id: "relay",
      label: "Relay availability",
      status:
        relayStatus === "healthy"
          ? "ok"
          : relayStatus === "degraded"
            ? "warn"
            : relayStatus === "failing"
              ? "error"
              : "warn",
      detail:
        relayStatus === "healthy"
          ? "Relay online"
          : relayStatus === "degraded"
            ? "Relay degraded — delivery may be delayed"
            : relayStatus === "failing"
              ? "Relay offline — delivery will fail"
              : "Relay status unknown",
    },
  ];

  const overall = overallStatus(checks);

  const bannerClass = {
    ready: "border-emerald-300/20 bg-emerald-300/[0.05] text-status-success dark:text-emerald-200",
    blocked: "border-red-300/20 bg-red-300/[0.05] text-status-danger dark:text-red-200",
    warning: "border-amber-300/20 bg-amber-300/[0.05] text-status-warning dark:text-amber-200",
    pending: "border-blue-300/20 bg-blue-300/[0.05] text-status-info dark:text-blue-200",
  }[overall];

  const bannerLabel = {
    ready: "Ready to send",
    blocked: "Blocked — fix issues before sending",
    warning: "Send with caution",
    pending: "Checking readiness…",
  }[overall];

  const BannerIcon = {
    ready: CheckCircle2,
    blocked: AlertCircle,
    warning: ShieldAlert,
    pending: Loader2,
  }[overall];

  return (
    <div
      className={cn("mx-0 mt-2 rounded-lg border px-3 py-2.5 text-[11px]", bannerClass)}
      aria-label="Delivery readiness"
    >
      {/* Header row */}
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        <BannerIcon
          className={cn("h-3.5 w-3.5 shrink-0", overall === "pending" && "animate-spin")}
        />
        <span>{bannerLabel}</span>
        <span className="ml-auto flex items-center gap-1 opacity-60">
          <Wifi className="h-3 w-3" />
          relay
        </span>
      </div>

      {/* Check rows */}
      <ul className="space-y-1.5">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2">
            <StatusIcon status={check.status} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="text-foreground/80">{check.label}</span>
              {check.detail && (
                <span className="ml-1 text-muted-foreground opacity-75">— {check.detail}</span>
              )}
            </span>
            {check.cta && (
              <button
                type="button"
                onClick={check.cta.action}
                className="shrink-0 rounded border border-current/20 bg-current/10 px-2 py-0.5 text-[10px] transition hover:bg-current/20"
              >
                {check.cta.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
