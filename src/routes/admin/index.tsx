import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Key } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface HealthData {
  status: string;
  ready: boolean;
  dependencies: {
    storage: string;
    coordinator?: string;
  };
  versions: Record<string, string>;
  timestamp: string;
}

interface Invite {
  code: string;
  status: "active" | "revoked";
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
  reason?: string;
}

function AdminDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [newCode, setNewCode] = useState("");
  const [newReason, setNewReason] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const adminAddress = "GADMIN777777777777777777777777777777777777777777777777777777";

  const fetchHealth = async () => {
    try {
      setLoadingHealth(true);
      const res = await fetch("/api/v1/admin/health", {
        headers: { "x-stealth-address": adminAddress },
      });
      if (!res.ok) throw new Error("Failed to fetch service health");
      const json = await res.json();
      setHealth(json.data);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoadingHealth(false);
    }
  };

  const fetchInvites = async () => {
    try {
      setLoadingInvites(true);
      const res = await fetch("/api/v1/admin/invites", {
        headers: { "x-stealth-address": adminAddress },
      });
      if (!res.ok) throw new Error("Failed to fetch invites");
      const json = await res.json();
      setInvites(json.data.invites || []);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchInvites();
  }, []);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newReason.trim()) return;

    try {
      setCreatingInvite(true);
      setErrorMsg(null);
      const res = await fetch("/api/v1/admin/invites", {
        method: "POST",
        headers: {
          "x-stealth-address": adminAddress,
          "content-type": "application/json",
        },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), reason: newReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to create invite");

      setNewCode("");
      setNewReason("");
      fetchInvites();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (code: string) => {
    if (!revokeReason.trim()) {
      alert("A revocation reason is required.");
      return;
    }

    try {
      setErrorMsg(null);
      const res = await fetch("/api/v1/admin/invites/revoke", {
        method: "POST",
        headers: {
          "x-stealth-address": adminAddress,
          "content-type": "application/json",
        },
        body: JSON.stringify({ code, reason: revokeReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to revoke invite");

      setRevokingCode(null);
      setRevokeReason("");
      fetchInvites();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Health & Invitations</h2>
          <p className="text-muted-foreground dark:text-neutral-400 text-sm">
            Monitor overall system health and manage active beta signup codes.
          </p>
        </div>
        <button
          onClick={() => {
            fetchHealth();
            fetchInvites();
          }}
          className="p-2 bg-card dark:bg-neutral-900 hover:bg-accent dark:hover:bg-neutral-800 border border-border dark:border-neutral-800 rounded-lg text-muted-foreground dark:text-neutral-400 hover:text-status-neutral dark:hover:text-neutral-100 transition-all flex items-center gap-2 text-xs"
        >
          <RefreshCw className="size-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-status-danger dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Health Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* API Status */}
        <div className="p-6 rounded-2xl border border-border dark:border-neutral-800 bg-card/30 dark:bg-neutral-900/30">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs text-muted-foreground dark:text-neutral-500 font-medium uppercase tracking-wider">
              System Status
            </span>
            {loadingHealth ? (
              <span className="text-muted-foreground dark:text-neutral-600 animate-pulse text-xs">
                Checking...
              </span>
            ) : health?.ready ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-3" />
                <span>ONLINE</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-status-danger dark:text-red-400 border border-red-500/20">
                <XCircle className="size-3" />
                <span>OUTAGE</span>
              </span>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold">
              {loadingHealth ? "..." : health?.status === "healthy" ? "Healthy" : "Degraded"}
            </h3>
            <p className="text-xs text-muted-foreground dark:text-neutral-500">
              API Readiness endpoints verifying storage dependencies.
            </p>
          </div>
        </div>

        {/* Database Dependencies */}
        <div className="p-6 rounded-2xl border border-border dark:border-neutral-800 bg-card/30 dark:bg-neutral-900/30">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs text-muted-foreground dark:text-neutral-500 font-medium uppercase tracking-wider">
              Storage State
            </span>
            <span className="text-muted-foreground dark:text-neutral-400 font-mono text-[10px]">
              Cloudflare KV
            </span>
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold capitalize">
              {loadingHealth
                ? "..."
                : health?.dependencies.storage === "ok"
                  ? "Connected"
                  : "Error"}
            </h3>
            <p className="text-xs text-muted-foreground dark:text-neutral-500">
              Repository adapters performing connection and validation checks.
            </p>
          </div>
        </div>

        {/* Version info */}
        <div className="p-6 rounded-2xl border border-border dark:border-neutral-800 bg-card/30 dark:bg-neutral-900/30">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs text-muted-foreground dark:text-neutral-500 font-medium uppercase tracking-wider">
              Service Build
            </span>
            <span className="text-muted-foreground dark:text-neutral-400 font-mono text-[10px]">
              API Version 1
            </span>
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground dark:text-neutral-500">Hush version:</span>
              <span className="text-status-neutral dark:text-neutral-300">
                {health?.versions?.api || "1.0.0"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground dark:text-neutral-500">Schema version:</span>
              <span className="text-status-neutral dark:text-neutral-300">
                {health?.versions?.schema || "1"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Manager Panel */}
      <div className="border border-border dark:border-neutral-800 bg-card/10 dark:bg-neutral-900/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border dark:border-neutral-800 bg-card/20 dark:bg-neutral-900/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Invite Code Management</h3>
            <p className="text-xs text-muted-foreground dark:text-neutral-500">
              Create new onboarding tokens or revoke existing credentials.
            </p>
          </div>

          {/* Creation Form */}
          <form onSubmit={handleCreateInvite} className="flex gap-2 shrink-0">
            <input
              type="text"
              placeholder="CODE (e.g. BETA_NEW)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="px-3 py-1.5 bg-card dark:bg-neutral-900 border border-border dark:border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-purple-500 uppercase font-mono w-40"
              required
            />
            <input
              type="text"
              placeholder="Reason for creation"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="px-3 py-1.5 bg-card dark:bg-neutral-900 border border-border dark:border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-purple-500 w-48"
              required
            />
            <button
              type="submit"
              disabled={creatingInvite}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              <span>Create</span>
            </button>
          </form>
        </div>

        {/* Invites List Table */}
        <div className="overflow-x-auto">
          {loadingInvites ? (
            <div className="p-12 text-center text-xs text-muted-foreground dark:text-neutral-500">
              Loading invite records...
            </div>
          ) : invites.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground dark:text-neutral-500">
              No invite codes currently registered.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border dark:border-neutral-800 text-muted-foreground dark:text-neutral-500 bg-card/10 dark:bg-neutral-900/10">
                  <th className="p-4">Invite Code</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4">Created At</th>
                  <th className="p-4">Revocation</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr
                    key={invite.code}
                    className="border-b border-border/60 dark:border-neutral-800/60 hover:bg-accent/20 dark:hover:bg-neutral-900/20"
                  >
                    <td className="p-4 font-mono font-bold text-status-neutral dark:text-neutral-200 tracking-wide uppercase">
                      {invite.code}
                    </td>
                    <td className="p-4">
                      {invite.status === "active" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary dark:bg-neutral-800 text-muted-foreground dark:text-neutral-500 border border-border dark:border-neutral-700">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground dark:text-neutral-400 max-w-xs truncate">
                      {invite.reason || "N/A"}
                    </td>
                    <td className="p-4 text-muted-foreground dark:text-neutral-500 font-mono select-all">
                      {invite.createdBy.slice(0, 6)}...{invite.createdBy.slice(-6)}
                    </td>
                    <td className="p-4 text-muted-foreground dark:text-neutral-500">
                      {new Date(invite.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      {invite.status === "active" ? (
                        revokingCode === invite.code ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Reason"
                              value={revokeReason}
                              onChange={(e) => setRevokeReason(e.target.value)}
                              className="px-2 py-1 bg-card dark:bg-neutral-900 border border-border dark:border-neutral-800 rounded text-[11px] focus:outline-none"
                              required
                            />
                            <button
                              onClick={() => handleRevokeInvite(invite.code)}
                              className="p-1.5 bg-red-600/10 hover:bg-red-600 border border-red-500/20 hover:border-red-500 text-status-danger dark:text-red-400 hover:text-white rounded cursor-pointer transition-all"
                            >
                              <Trash2 className="size-3" />
                            </button>
                            <button
                              onClick={() => {
                                setRevokingCode(null);
                                setRevokeReason("");
                              }}
                              className="p-1.5 bg-secondary dark:bg-neutral-800 hover:bg-accent dark:hover:bg-neutral-700 rounded text-muted-foreground dark:text-neutral-400 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRevokingCode(invite.code)}
                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-status-danger dark:text-red-400 hover:text-status-danger dark:hover:text-red-300 rounded font-semibold border border-red-500/20 transition-all cursor-pointer"
                          >
                            Revoke
                          </button>
                        )
                      ) : (
                        <span className="text-muted-foreground dark:text-neutral-600 font-mono text-[10px]">
                          Revoked by {invite.revokedBy?.slice(0, 4)}...
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
