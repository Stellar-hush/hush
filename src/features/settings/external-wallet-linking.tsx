import { useState, useEffect, useCallback, useId } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Info,
  Link2,
  Lock,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ActiveSigner,
  ExternalWallet,
  ManagedWalletStatus,
  WalletCapability,
} from "@/server/api/domain";
import {
  getManagedWalletStatus,
  listLinkedWallets,
  requestChallenge,
  unlinkWallet,
  updateWalletCapabilities,
  verifyAndLink,
  WalletLinkError,
  WalletNotInstalledError,
  WalletRejectedError,
  WrongNetworkError,
} from "@/services/stellar/wallet-link";
import { getFreighterApi, getFreighterNetwork } from "@/services/stellar/wallet";

type LinkingState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "connecting" }
  | { status: "challenged"; challenge: string; expiresAt: string }
  | { status: "signing" }
  | { status: "verifying" }
  | { status: "linked"; address: string }
  | { status: "error"; message: string; code?: string };

const CAPABILITY_DEFINITIONS: Record<
  WalletCapability,
  { label: string; description: string; badge: string }
> = {
  sign: {
    label: "Sign messages",
    description: "Authorize outgoing messages and prove address ownership",
    badge: "Signer",
  },
  send: {
    label: "Send transactions",
    description: "Submit transactions directly from the linked wallet",
    badge: "Transactor",
  },
  read: {
    label: "Read access",
    description: "View balance, transaction history, and public status",
    badge: "Reader",
  },
};

const NETWORKS = [
  {
    passphrase: "Test SDF Network ; September 2015",
    label: "Testnet",
    description: "Public Stellar Testnet for testing",
  },
  {
    passphrase: "Public Global Stellar Network ; September 2015",
    label: "Mainnet",
    description: "Production Stellar Network",
  },
] as const;

export function ExternalWalletSettings({ ownerAddress }: { ownerAddress?: string }) {
  const liveRegionId = useId();
  const [managedStatus, setManagedStatus] = useState<ManagedWalletStatus | null>(null);
  const [loadingManaged, setLoadingManaged] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [managedError, setManagedError] = useState<string | null>(null);

  const [wallets, setWallets] = useState<ExternalWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [activeSigner, setActiveSigner] = useState<ActiveSigner | null>(null);

  const [linkingState, setLinkingState] = useState<LinkingState>({ status: "idle" });
  const [selectedCapabilities, setSelectedCapabilities] = useState<WalletCapability[]>([
    "sign",
    "read",
  ]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>(NETWORKS[0].passphrase);

  const [editingWallet, setEditingWallet] = useState<{
    address: string;
    capabilities: WalletCapability[];
  } | null>(null);
  const [savingCapabilities, setSavingCapabilities] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const [unlinkingAddress, setUnlinkingAddress] = useState<string | null>(null);

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const loadManagedStatus = useCallback(async () => {
    try {
      setLoadingManaged(true);
      setManagedError(null);
      const status = await getManagedWalletStatus();
      setManagedStatus(status);
      setActiveSigner(status.activeSigner);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load managed wallet status";
      setManagedError(msg);
      // If endpoint not yet ready or offline, synthesize fallback status
      if (ownerAddress) {
        setManagedStatus({
          address: ownerAddress,
          status: "active",
          network: NETWORKS[0].passphrase,
          balance: { available: null, balanceXlm: null },
          capabilities: ["sign", "send", "read"],
          isDefaultSigner: true,
          activeSigner: {
            signerType: "managed",
            address: ownerAddress,
            capabilities: ["sign", "send", "read"],
            isFallback: true,
          },
        });
      }
    } finally {
      setLoadingManaged(false);
    }
  }, [ownerAddress]);

  const loadWallets = useCallback(async () => {
    try {
      setLoadingWallets(true);
      const linked = await listLinkedWallets();
      setWallets(linked);
    } catch {
      setWallets([]);
    } finally {
      setLoadingWallets(false);
    }
  }, []);

  useEffect(() => {
    loadManagedStatus();
    loadWallets();
  }, [loadManagedStatus, loadWallets]);

  const handleRefreshBalance = async () => {
    try {
      setRefreshingBalance(true);
      const status = await getManagedWalletStatus();
      setManagedStatus(status);
      setActiveSigner(status.activeSigner);
    } catch {
      // Keep existing balance if refresh fails
    } finally {
      setRefreshingBalance(false);
    }
  };

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleConnect = async () => {
    setLinkingState({ status: "checking" });

    try {
      const freighter = await getFreighterApi();

      const connected = await freighter.isConnected();
      if (!connected?.isConnected) {
        throw new WalletNotInstalledError();
      }

      setLinkingState({ status: "connecting" });
      const access = (await freighter.requestAccess()) as {
        address?: string;
        error?: unknown;
      };

      if (access?.error || !access?.address) {
        const errorMsg =
          typeof access?.error === "string"
            ? access.error
            : (access?.error as any)?.message || "Wallet access was declined";
        throw new WalletRejectedError(errorMsg);
      }

      const externalAddress = access.address;

      // Check network compatibility
      const detectedNetwork = await getFreighterNetwork();
      if (detectedNetwork && detectedNetwork !== selectedNetwork) {
        const targetLabel =
          NETWORKS.find((n) => n.passphrase === selectedNetwork)?.label ?? "target";
        throw new WrongNetworkError(
          `Freighter is set to a different network. Please switch your wallet network to ${targetLabel} and try again.`,
        );
      }

      // Check local duplicate before network call
      if (wallets.some((w) => w.address === externalAddress)) {
        throw new WalletLinkError(
          "This external wallet is already linked to your account.",
          "conflict",
          409,
        );
      }

      setLinkingState({ status: "challenged", challenge: "", expiresAt: "" });
      const challengeResult = await requestChallenge(externalAddress, selectedNetwork);

      setLinkingState({
        status: "signing",
      });

      const signed = (await freighter.signMessage(challengeResult.challenge)) as {
        signedMessage?: unknown;
        error?: unknown;
      };

      if (signed?.error) {
        const signErrorMsg =
          typeof signed.error === "string"
            ? signed.error
            : (signed.error as any)?.message || "Challenge signing was declined";
        throw new WalletRejectedError(signErrorMsg);
      }

      const signature =
        typeof signed.signedMessage === "string"
          ? signed.signedMessage
          : Array.isArray(signed.signedMessage)
            ? Array.from(signed.signedMessage as number[], (b: number) =>
                b.toString(16).padStart(2, "0"),
              ).join("")
            : "";

      setLinkingState({ status: "verifying" });

      const newWallet = await verifyAndLink(
        externalAddress,
        signature,
        selectedCapabilities,
        selectedNetwork,
      );

      setWallets((prev) => {
        const filtered = prev.filter((w) => w.address !== newWallet.address);
        return [...filtered, newWallet];
      });

      // Update active signer to the newly linked external wallet if it has sign capability
      if (newWallet.capabilities.includes("sign")) {
        setActiveSigner({
          signerType: "external",
          address: newWallet.address,
          capabilities: newWallet.capabilities,
          isFallback: false,
        });
      }

      setLinkingState({ status: "linked", address: externalAddress });
      setTimeout(() => setLinkingState({ status: "idle" }), 3500);
    } catch (err) {
      if (err instanceof WalletLinkError) {
        setLinkingState({ status: "error", message: err.message, code: err.code });
      } else if (err instanceof Error) {
        setLinkingState({ status: "error", message: err.message });
      } else {
        setLinkingState({ status: "error", message: "Failed to connect wallet" });
      }
    }
  };

  const handleSaveCapabilities = async () => {
    if (!editingWallet) return;
    if (editingWallet.capabilities.length === 0) return;

    try {
      setSavingCapabilities(true);
      const res = await updateWalletCapabilities(editingWallet.address, editingWallet.capabilities);
      setWallets((prev) => prev.map((w) => (w.address === editingWallet.address ? res.wallet : w)));
      setActiveSigner(res.activeSigner);
      setEditingWallet(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update capabilities";
      setLinkingState({ status: "error", message: msg });
    } finally {
      setSavingCapabilities(false);
    }
  };

  const handleUnlink = async (address: string) => {
    try {
      setUnlinkingAddress(address);
      const res = await unlinkWallet(address, { confirm: true });
      setWallets((prev) => prev.filter((w) => w.address !== address));
      setActiveSigner(res.activeSigner);
      setConfirmUnlink(null);
    } catch (err) {
      const message = err instanceof WalletLinkError ? err.message : "Failed to unlink wallet";
      setLinkingState({ status: "error", message });
    } finally {
      setUnlinkingAddress(null);
    }
  };

  const toggleSelectedCapability = (cap: WalletCapability) => {
    setSelectedCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const toggleEditingCapability = (cap: WalletCapability) => {
    if (!editingWallet) return;
    const exists = editingWallet.capabilities.includes(cap);
    const next = exists
      ? editingWallet.capabilities.filter((c) => c !== cap)
      : [...editingWallet.capabilities, cap];
    setEditingWallet({ ...editingWallet, capabilities: next });
  };

  const isProcessing = ["checking", "connecting", "challenged", "signing", "verifying"].includes(
    linkingState.status,
  );

  const displayManagedAddress = managedStatus?.address || ownerAddress || "GDQ...X4KJ";
  const isManagedActiveSigner =
    !activeSigner || activeSigner.signerType === "managed" || activeSigner.isFallback;

  return (
    <div className="space-y-6" data-testid="settings-wallet-controls">
      {/* Screen reader announcement region */}
      <div id={liveRegionId} aria-live="polite" className="sr-only">
        {linkingState.status === "checking" && "Checking Freighter extension availability"}
        {linkingState.status === "connecting" && "Requesting wallet connection"}
        {linkingState.status === "signing" && "Awaiting challenge signature in wallet"}
        {linkingState.status === "verifying" && "Verifying cryptographic proof on server"}
        {linkingState.status === "linked" && `Wallet ${linkingState.address} linked successfully`}
        {linkingState.status === "error" && `Error: ${linkingState.message}`}
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">Wallet controls & signers</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your default managed wallet and optionally link external Stellar wallets. Wallet
          connections never alter your account credentials.
        </p>
      </div>

      {/* Signer Selection & Fallback Explanation Banner */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-info dark:text-blue-400 shrink-0" />
            <span className="text-xs font-semibold text-foreground">Active Transaction Signer</span>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              isManagedActiveSigner
                ? "bg-blue-500/10 text-status-info dark:text-blue-400 border border-blue-500/20"
                : "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
            )}
          >
            {isManagedActiveSigner ? "Managed Wallet (Default)" : "External Wallet"}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {isManagedActiveSigner ? (
            <>
              All messages and protocol actions are currently signed by your{" "}
              <strong>Managed Wallet</strong>. Linking an external wallet with the{" "}
              <em>Sign messages</em> capability will designate it as the primary signer.
            </>
          ) : (
            <>
              External wallet{" "}
              <code className="text-foreground text-[10px]">
                {activeSigner?.address.slice(0, 8)}...{activeSigner?.address.slice(-6)}
              </code>{" "}
              is designated as the active message signer. If unlinked or unavailable, Hush
              automatically falls back to your Managed Wallet.
            </>
          )}
        </p>
      </div>

      {/* Managed Wallet Public Status & Balance Card */}
      <div className="rounded-xl border border-surface-tint/10 bg-surface-tint/[0.025] p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-status-info dark:text-blue-400 border border-blue-500/20">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-foreground">Managed Wallet</h4>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-status-success dark:text-emerald-400 font-medium">
                  {managedStatus?.status === "funded" ? "Funded" : "Active"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Server-side enclave custody</p>
            </div>
          </div>

          <button
            onClick={handleRefreshBalance}
            disabled={refreshingBalance || loadingManaged}
            aria-label="Refresh wallet balance"
            className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-surface-tint/[0.06] hover:text-foreground transition disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", refreshingBalance && "animate-spin")} />
            <span>{refreshingBalance ? "Updating..." : "Refresh"}</span>
          </button>
        </div>

        {/* Public Address */}
        <div className="rounded-lg border border-surface-tint/5 bg-surface-recessed/20 p-3 space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Public Stellar Address
          </span>
          <div className="flex items-center justify-between gap-2">
            <code className="text-xs font-mono text-foreground break-all">
              {displayManagedAddress}
            </code>
            <button
              onClick={() => handleCopy(displayManagedAddress)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-tint/10 hover:text-foreground transition shrink-0"
              title="Copy address"
              aria-label="Copy public Stellar address"
            >
              {copiedAddress === displayManagedAddress ? (
                <Check className="h-3.5 w-3.5 text-status-success dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Live Testnet Balance Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-surface-tint/5 bg-surface-tint/[0.02] p-3 space-y-1">
            <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground">
              Testnet Balance
            </span>
            <div className="text-sm font-semibold text-foreground">
              {loadingManaged ? (
                <span className="text-muted-foreground animate-pulse">Loading balance...</span>
              ) : managedStatus?.balance.balanceXlm ? (
                <span>{managedStatus.balance.balanceXlm} XLM</span>
              ) : (
                <span className="text-muted-foreground">0.00 XLM</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Network:{" "}
              {NETWORKS.find((n) => n.passphrase === managedStatus?.network)?.label ?? "Testnet"}
            </p>
          </div>

          <div className="rounded-lg border border-surface-tint/5 bg-surface-tint/[0.02] p-3 space-y-1">
            <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground">
              Custody Security
            </span>
            <div className="text-xs text-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-status-info dark:text-blue-400 shrink-0" />
              <span>Hardware-sealed keys</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              No private keys are ever exposed to the client or browser extension.
            </p>
          </div>
        </div>

        {managedError && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-status-warning dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{managedError}</span>
          </div>
        )}
      </div>

      {/* Linked External Wallets Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-foreground">Linked External Wallets</h4>
            <p className="text-[11px] text-muted-foreground">
              Wallets you have cryptographically verified with ownership proofs.
            </p>
          </div>
          <span className="rounded-full bg-surface-tint/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {wallets.length} {wallets.length === 1 ? "wallet" : "wallets"}
          </span>
        </div>

        {loadingWallets ? (
          <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/[0.02] p-6 space-y-3 animate-pulse">
            <div className="h-4 w-1/3 bg-surface-tint/10 rounded" />
            <div className="h-3 w-2/3 bg-surface-tint/5 rounded" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-tint/10 bg-surface-tint/[0.015] p-6 text-center space-y-2">
            <Wallet className="mx-auto h-7 w-7 text-muted-foreground/40" />
            <p className="text-xs font-medium text-foreground">No external wallets linked</p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              Connecting a hardware or extension wallet is optional. Your managed wallet handles all
              transactions by default.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map((wallet) => {
              const isCurrentSigner =
                activeSigner?.signerType === "external" && activeSigner.address === wallet.address;
              const isEditing = editingWallet?.address === wallet.address;

              return (
                <div
                  key={wallet.address}
                  className={cn(
                    "rounded-xl border p-4 transition space-y-3",
                    isCurrentSigner
                      ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                      : "border-surface-tint/10 bg-surface-tint/[0.02]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5",
                          isCurrentSigner
                            ? "bg-emerald-500/10 text-status-success dark:text-emerald-400"
                            : "bg-surface-tint/[0.06] text-muted-foreground",
                        )}
                      >
                        <Link2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-foreground break-all">
                            {wallet.address}
                          </code>
                          <button
                            onClick={() => handleCopy(wallet.address)}
                            className="rounded p-1 text-muted-foreground hover:bg-surface-tint/10 hover:text-foreground transition"
                            title="Copy address"
                            aria-label={`Copy address ${wallet.address}`}
                          >
                            {copiedAddress === wallet.address ? (
                              <Check className="h-3 w-3 text-status-success dark:text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                          {isCurrentSigner && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-status-success dark:text-emerald-400 border border-emerald-500/20">
                              Active Signer
                            </span>
                          )}
                        </div>

                        {/* Capabilities & Metadata */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {wallet.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="rounded-md bg-surface-tint/[0.06] border border-surface-tint/5 px-2 py-0.5 text-[10px] text-foreground font-medium"
                            >
                              {CAPABILITY_DEFINITIONS[cap]?.label ?? cap}
                            </span>
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-1">
                            •{" "}
                            {NETWORKS.find((n) => n.passphrase === wallet.network)?.label ??
                              "Stellar"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            • Linked {new Date(wallet.linkedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          setEditingWallet(
                            isEditing
                              ? null
                              : { address: wallet.address, capabilities: [...wallet.capabilities] },
                          )
                        }
                        className={cn(
                          "rounded-lg p-1.5 transition text-xs flex items-center gap-1",
                          isEditing
                            ? "bg-surface-tint/10 text-foreground"
                            : "text-muted-foreground hover:bg-surface-tint/[0.06] hover:text-foreground",
                        )}
                        title="Configure capabilities"
                        aria-label={`Configure capabilities for ${wallet.address}`}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        <span className="text-[11px] hidden sm:inline">Configure</span>
                      </button>

                      <button
                        onClick={() => setConfirmUnlink(wallet.address)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-status-danger dark:hover:text-red-400 transition"
                        title="Unlink wallet"
                        aria-label={`Unlink wallet ${wallet.address}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Configure Capabilities Form */}
                  {isEditing && (
                    <div className="rounded-lg border border-surface-tint/10 bg-surface-recessed/30 p-3 space-y-3 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          Edit Permitted Capabilities
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Requires explicit confirmation
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(
                          Object.entries(CAPABILITY_DEFINITIONS) as [
                            WalletCapability,
                            { label: string; description: string },
                          ][]
                        ).map(([cap, { label }]) => {
                          const checked = editingWallet.capabilities.includes(cap);
                          return (
                            <button
                              key={cap}
                              type="button"
                              onClick={() => toggleEditingCapability(cap)}
                              className={cn(
                                "flex items-center justify-between rounded-lg border p-2.5 text-left transition text-xs",
                                checked
                                  ? "border-emerald-400/30 bg-emerald-400/[0.08] text-foreground"
                                  : "border-surface-tint/10 bg-surface-tint/[0.02] text-muted-foreground hover:bg-surface-tint/[0.04]",
                              )}
                            >
                              <span>{label}</span>
                              {checked && (
                                <Check className="h-3.5 w-3.5 text-status-success dark:text-emerald-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingWallet(null)}
                          className="rounded-lg border border-surface-tint/10 px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-tint/[0.06] transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveCapabilities}
                          disabled={savingCapabilities || editingWallet.capabilities.length === 0}
                          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition disabled:opacity-50"
                        >
                          {savingCapabilities ? "Saving..." : "Save & Apply"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Unlink Confirmation Prompt */}
                  {confirmUnlink === wallet.address && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 space-y-2 mt-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-status-danger dark:text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-status-danger dark:text-red-200">
                            Unlink this external wallet?
                          </p>
                          <p className="text-[11px] text-status-danger/80 dark:text-red-200/80 mt-0.5">
                            Transaction signing will immediately fall back to your Managed Wallet.
                            Your account login credentials remain unaffected.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setConfirmUnlink(null)}
                          className="rounded-lg border border-surface-tint/10 px-3 py-1 text-xs text-muted-foreground hover:bg-surface-tint/[0.06] transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUnlink(wallet.address)}
                          disabled={unlinkingAddress === wallet.address}
                          className="rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 transition disabled:opacity-50"
                        >
                          {unlinkingAddress === wallet.address ? "Unlinking..." : "Confirm Unlink"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect New External Wallet Section */}
      <div className="rounded-xl border border-surface-tint/10 bg-surface-tint/[0.025] p-5 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-foreground">Connect New External Wallet</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Connect a Freighter browser wallet to authorize cryptographic signing on Stellar.
          </p>
        </div>

        {/* Network Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Target Network</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NETWORKS.map((network) => (
              <button
                key={network.passphrase}
                type="button"
                onClick={() => setSelectedNetwork(network.passphrase)}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  selectedNetwork === network.passphrase
                    ? "border-blue-500/40 bg-blue-500/[0.08] text-foreground"
                    : "border-surface-tint/10 bg-surface-tint/[0.02] text-muted-foreground hover:border-surface-tint/20 hover:text-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{network.label}</span>
                  {selectedNetwork === network.passphrase && (
                    <Check className="h-3.5 w-3.5 text-status-info dark:text-blue-400" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{network.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Permitted Capabilities Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Permitted Capabilities</label>
          <div className="space-y-2">
            {(
              Object.entries(CAPABILITY_DEFINITIONS) as [
                WalletCapability,
                { label: string; description: string; badge: string },
              ][]
            ).map(([cap, { label, description }]) => {
              const selected = selectedCapabilities.includes(cap);
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleSelectedCapability(cap)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border p-3 text-left transition",
                    selected
                      ? "border-emerald-400/30 bg-emerald-400/[0.06]"
                      : "border-surface-tint/10 bg-surface-tint/[0.02] hover:bg-surface-tint/[0.04]",
                  )}
                >
                  <div>
                    <span className="block text-xs font-medium text-foreground">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {description}
                    </span>
                  </div>
                  {selected && (
                    <Check className="h-4 w-4 text-status-success dark:text-emerald-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Banner with Recovery Guidance */}
        {linkingState.status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger dark:text-red-400" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-status-danger dark:text-red-200">
                  Connection Failed
                </p>
                <p className="text-xs text-status-danger/90 dark:text-red-200/90 leading-relaxed">
                  {linkingState.message}
                </p>
              </div>
            </div>

            {linkingState.code === "wallet_not_installed" && (
              <div className="pt-1 flex items-center gap-2">
                <a
                  href="https://www.freighter.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-1 text-xs text-status-danger dark:text-red-200 hover:bg-red-500/30 transition font-medium"
                >
                  <span>Install Freighter Extension</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Success Banner */}
        {linkingState.status === "linked" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-2.5 text-status-success dark:text-emerald-300 text-xs">
            <Check className="h-4 w-4 shrink-0 text-status-success dark:text-emerald-400" />
            <span>Wallet successfully verified and linked!</span>
          </div>
        )}

        {/* Connect Action Button */}
        <button
          onClick={handleConnect}
          disabled={isProcessing || selectedCapabilities.length === 0}
          className={cn(
            "w-full rounded-xl py-2.5 px-4 text-xs font-semibold transition flex items-center justify-center gap-2",
            isProcessing || selectedCapabilities.length === 0
              ? "cursor-not-allowed bg-surface-tint/[0.06] text-muted-foreground"
              : "bg-foreground text-background hover:opacity-90 active:scale-[0.99]",
          )}
        >
          {linkingState.status === "checking" && (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Checking Freighter extension...</span>
            </>
          )}
          {linkingState.status === "connecting" && (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Connecting to Freighter...</span>
            </>
          )}
          {linkingState.status === "challenged" && (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Requesting verification challenge...</span>
            </>
          )}
          {linkingState.status === "signing" && (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Awaiting signature in Freighter...</span>
            </>
          )}
          {linkingState.status === "verifying" && (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Verifying cryptographic proof...</span>
            </>
          )}
          {linkingState.status === "linked" && "Wallet Linked!"}
          {linkingState.status === "idle" && "Connect Freighter Wallet"}
          {linkingState.status === "error" && "Retry Connection"}
        </button>

        {/* Security & Credentials Guarantee Notice */}
        <div className="rounded-lg border border-surface-tint/5 bg-surface-tint/[0.015] p-3 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Linking or unlinking external wallets will never modify your login credentials, email
            address, or managed account state.
          </p>
        </div>
      </div>
    </div>
  );
}
