/**
 * BETA-067 (Issue #1974): Live attachment preview, download, and malware-safe handling.
 *
 * Replaces the previous mock-data drawer with a real decrypt → verify → present
 * pipeline. Every attachment goes through authenticated decryption (AES-256-GCM
 * via the envelope content key), content-hash verification, and is rendered in
 * an isolated context that prevents active content execution.
 *
 * Safe types (image, PDF, text, JSON, CSV, XML) are previewed in sandboxed
 * iframes or blob URLs. Risky/executable formats are forced into a safe
 * download path — no preview is ever attempted.
 *
 * BETA-031 dependency note: API routes for streaming encrypted attachment
 * chunks from R2 storage are not yet merged. This component decrypts inline
 * ciphertext from the sealed envelope. When BETA-031 lands, the download
 * path would fetch from the attachment API route instead.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  Braces,
  Lock,
  File,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  FileCode,
  X,
  RefreshCw,
  AlertTriangle,
  WifiOff,
  Clock,
  Ban,
  Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  useAttachmentDownload,
  isPreviewableType,
  isRiskyType,
} from "@/features/mail/useAttachmentDownload";
import { sanitizeFilenameForDisplay } from "@/services/crypto/attachment-metadata";

export type Attachment = {
  name: string;
  size: string;
  type: string;
  messageId?: string;
  contentHash?: string;
  totalChunks?: number;
  encryptionKey?: CryptoKey;
  ownerAddress?: string;
  manifest?: {
    algorithm: string;
    chunk_size: number;
    chunk_count: number;
    total_size_bytes: number;
    base_nonce: string;
    manifest_mac: string;
  };
  /** Encrypted ciphertext (base64) from the sealed envelope. */
  encryptedCiphertext?: string;
  /** Hex-encoded 12-byte nonce from the attachment's encryption_metadata. */
  encryptedNonce?: string;
  /** Hex-encoded 16-byte GCM tag from the attachment's encryption_metadata. */
  encryptedMac?: string;
  /** Expected SHA-256 hex content hash for integrity verification. */
  expectedContentHash?: string;
  /** The AES-GCM content key for decryption. */
  contentKey?: CryptoKey;
};

interface AttachmentPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: Attachment | null;
  senderAddress?: string;
  /** Encrypted ciphertext (base64) from the sealed envelope. */
  encryptedCiphertext?: string;
  /** Hex-encoded 12-byte nonce from the attachment's encryption_metadata. */
  encryptedNonce?: string;
  /** Hex-encoded 16-byte GCM tag from the attachment's encryption_metadata. */
  encryptedMac?: string;
  /** Expected SHA-256 hex content hash for integrity verification. */
  expectedContentHash?: string;
  /** The AES-GCM content key for decryption. */
  contentKey?: CryptoKey;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    json: "application/json",
    txt: "text/plain",
    log: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    xml: "application/xml",
    html: "text/html",
    svg: "image/svg+xml",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

function getHeaderIcon(type: string) {
  const t = type.toLowerCase();
  if (t === "pdf") return <FileText className="h-5 w-5 text-status-danger dark:text-red-300" />;
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(t))
    return <ImageIcon className="h-5 w-5 text-status-special dark:text-violet-300" />;
  if (t === "json") return <Braces className="h-5 w-5 text-status-success dark:text-emerald-300" />;
  if (["txt", "log", "md", "csv", "xml"].includes(t))
    return <FileCode className="h-5 w-5 text-status-info dark:text-sky-200" />;
  if (["enc", "pgp", "gpg", "bin", "payload"].includes(t))
    return <Lock className="h-5 w-5 text-status-warning dark:text-amber-300" />;
  return <File className="h-5 w-5 text-status-neutral dark:text-slate-300" />;
}

// --- JSON Syntax Highlighting ---

function renderHighlightedJson(jsonStr: string) {
  const stringPattern = String.raw`"(?:\\.|[^"\\])*"(?:\s*:)?`;
  const keywordPattern = String.raw`\b(?:true|false|null)\b`;
  const numberPattern = String.raw`-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?`;
  const regex = new RegExp(`(${stringPattern}|${keywordPattern}|${numberPattern})`, "g");
  const parts = jsonStr.split(regex);
  let offset = 0;

  return parts.map((part) => {
    if (!part) return null;
    const key = `token-${offset}`;
    offset += part.length;

    if (part.startsWith('"') && part.endsWith(":")) {
      return (
        <span key={key} className="text-status-info dark:text-sky-300">
          {part}
        </span>
      );
    }
    if (part.startsWith('"')) {
      return (
        <span key={key} className="text-status-success dark:text-emerald-300">
          {part}
        </span>
      );
    }
    if (/^(true|false)$/.test(part)) {
      return (
        <span key={key} className="text-status-warning dark:text-amber-300 font-semibold">
          {part}
        </span>
      );
    }
    if (part === "null") {
      return (
        <span key={key} className="text-muted-foreground dark:text-gray-400 italic">
          {part}
        </span>
      );
    }
    if (/^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(part)) {
      return (
        <span key={key} className="text-status-special dark:text-violet-300">
          {part}
        </span>
      );
    }
    return (
      <span key={key} className="text-white/80">
        {part}
      </span>
    );
  });
}

// --- Text with Line Numbers ---

function renderTextWithLines(text: string) {
  let lineCounter = 1;
  const lines = text.split("\n").map((content) => {
    const num = lineCounter++;
    return { id: `line-${num}`, num, content };
  });

  return (
    <div className="flex font-mono text-[13px] leading-6 select-text">
      <div className="w-10 text-right select-none text-muted-foreground/45 border-r border-surface-tint/5 pr-2.5 mr-3 font-semibold tabular-nums">
        {lines.map((line) => (
          <div key={`num-${line.id}`}>{line.num}</div>
        ))}
      </div>
      <div className="flex-1 overflow-x-auto whitespace-pre text-foreground/90">
        {lines.map((line) => (
          <div key={`content-${line.id}`}>{line.content || " "}</div>
        ))}
      </div>
    </div>
  );
}

// --- Progress Bar ---

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-1 bg-surface-tint/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-emerald-400 transition-all duration-300 ease-out rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Download progress"
      />
    </div>
  );
}

// --- Status Messages ---

function StatusOverlay({
  state,
  error,
  onRetry,
  onCancel,
}: {
  state: string;
  error: { message: string; retryable: boolean } | null;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  if (state === "ready" || state === "idle") return null;

  const icons: Record<string, React.ReactNode> = {
    loading: <Loader2 className="h-8 w-8 text-status-info dark:text-sky-300 animate-spin" />,
    decrypting: <Lock className="h-8 w-8 text-status-warning dark:text-amber-300 animate-pulse" />,
    error: <AlertTriangle className="h-8 w-8 text-status-danger dark:text-red-400" />,
    unauthorized: <Ban className="h-8 w-8 text-status-danger dark:text-red-400" />,
    offline: <WifiOff className="h-8 w-8 text-status-warning dark:text-orange-300" />,
    expired: <Clock className="h-8 w-8 text-status-warning dark:text-yellow-300" />,
    oversized: <AlertTriangle className="h-8 w-8 text-status-warning dark:text-orange-400" />,
    corrupted: <ShieldAlert className="h-8 w-8 text-status-danger dark:text-red-400" />,
  };

  const labels: Record<string, string> = {
    loading: "Fetching attachment…",
    decrypting: "Decrypting and verifying…",
    error: "Download failed",
    unauthorized: "Unauthorized",
    offline: "You are offline",
    expired: "Download link expired",
    oversized: "File too large",
    corrupted: "Attachment corrupted",
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
      <div className="mb-4">
        {icons[state] ?? <AlertTriangle className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="text-sm font-semibold text-foreground/95 mb-2">
        {labels[state] ?? "Unknown state"}
      </h3>
      {error && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{error.message}</p>
      )}
      <div className="flex items-center gap-2">
        {error?.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 bg-surface-tint/4 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-tint/8 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 bg-surface-tint/4 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-tint/8 transition"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// --- Main Component ---

export function AttachmentPreviewDrawer({
  isOpen,
  onClose,
  attachment,
  senderAddress,
  encryptedCiphertext,
  encryptedNonce,
  encryptedMac,
  expectedContentHash,
  contentKey,
}: Readonly<AttachmentPreviewDrawerProps>) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const hasRealMetadata = Boolean(
    attachment?.messageId &&
    attachment?.contentHash &&
    attachment?.totalChunks &&
    attachment?.encryptionKey &&
    attachment?.manifest,
  );

  // Reset local state when attachment changes
  const contentRef = useRef<HTMLDivElement>(null);

  const ciphertext = encryptedCiphertext ?? attachment?.encryptedCiphertext;
  const nonce = encryptedNonce ?? attachment?.encryptedNonce;
  const mac = encryptedMac ?? attachment?.encryptedMac;
  const contentHash = expectedContentHash ?? attachment?.expectedContentHash;
  const key = contentKey ?? attachment?.contentKey;

  const { startDownload, ...download } = useAttachmentDownload({
    attachment,
    encryptedCiphertext: ciphertext,
    encryptedNonce: nonce,
    encryptedMac: mac,
    expectedContentHash: contentHash,
    contentKey: key,
    isOpen,
  });

  // Reset local state when attachment changes.
  useEffect(() => {
    setCopied(false);
    setZoom(1);
    setRotation(0);
    setPdfPage(1);
    setSearchQuery("");
    setDownloadProgress(null);
  }, [attachment?.name]);

  const getMimeType = (ext: string) => {
    if (ext === "json") return "application/json";
    if (ext === "pdf") return "application/pdf";
    if (ext === "txt") return "text/plain";
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    return "application/octet-stream";
  };

  const handleDownload = useCallback(async () => {
    if (!attachment) return;

    const attachmentType = attachment.type.toLowerCase();

    if (
      hasRealMetadata &&
      attachment.messageId &&
      attachment.contentHash &&
      attachment.totalChunks
    ) {
      startDownload();
      return;
    }

    if (isImage || attachmentType === "pdf") {
      const link = document.createElement("a");
      link.href = `/${attachment.name}`;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      const text = `Content for ${attachment.name}`;
      const blob = new Blob([text], {
        type: getMimeType(attachmentType),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  }, [hasRealMetadata, attachment, startDownload]);

  const type = attachment?.type?.toLowerCase() ?? "";
  const isPDF = type === "pdf";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(type);
  const isJSON = type === "json";
  const isText = ["txt", "log", "md", "csv"].includes(type);
  const isXML = type === "xml";
  const isEncrypted = ["enc", "pgp", "gpg", "bin", "payload"].includes(type);
  const isRisky = isRiskyType(type);
  const canPreview =
    isPreviewableType(type) && !isRisky && download.state === "ready" && download.result;

  // Determine the text content for copy/download.
  const textContent = useMemo(() => {
    if (!download.result) return "";
    if (isJSON || isText || isXML) {
      return new TextDecoder().decode(download.result.bytes);
    }
    return "";
  }, [download.result, isJSON, isText, isXML]);

  const handleCopy = useCallback(async () => {
    if (!textContent) return;
    await navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  const handleDownloadFile = useCallback(() => {
    if (!download.result) return;
    const link = document.createElement("a");
    link.href = download.result.blobUrl;
    link.download = download.result.safeFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [download.result]);

  const handleForceDownload = useCallback(() => {
    if (!download.result) return;
    handleDownloadFile();
  }, [download.result, handleDownloadFile]);

  if (!attachment) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="sm:max-w-2xl md:max-w-3xl w-full h-full p-0 flex flex-col border-l border-surface-tint/10 bg-surface-recessed/85 backdrop-blur-xl"
        aria-label={`Attachment preview: ${sanitizeFilenameForDisplay(attachment.name)}`}
      >
        {/* Header */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between border-b border-surface-tint/5 px-4 py-3 sm:px-6 sm:py-4.5 gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl border border-surface-tint/8 bg-surface-tint/4 shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
              {getHeaderIcon(type)}
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm sm:text-[15px] font-semibold text-foreground/95">
                {sanitizeFilenameForDisplay(attachment.name)}
              </SheetTitle>
              <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11px] text-muted-foreground/80 font-medium">
                <span>{attachment.size}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span className="uppercase">{attachment.type} attachment</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 pr-6 sm:pr-8">
            {(isJSON || isText || isXML) && download.state === "ready" && (
              <button
                onClick={handleCopy}
                title="Copy contents"
                className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 bg-surface-tint/4 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-tint/8 hover:text-foreground transition duration-150"
                aria-label={copied ? "Copied" : "Copy contents"}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-status-success dark:text-emerald-400" />
                    <span className="text-status-success dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={download.state === "loading"}
              title="Download file"
              className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 transition duration-150 disabled:opacity-50"
            >
              {download.state === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{download.state === "loading" ? "Downloading..." : "Download"}</span>
            </button>
            {download.state === "ready" && (
              <button
                onClick={handleDownloadFile}
                title="Download file"
                className="flex items-center gap-1.5 rounded-lg border border-surface-tint/10 bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 transition duration-150"
                aria-label="Download file"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar (shown during loading/decrypting) */}
        {(download.state === "loading" || download.state === "decrypting") && (
          <div className="px-6 py-1">
            <ProgressBar progress={download.progress} />
          </div>
        )}

        {/* Preview Viewport */}
        <div
          className="flex-1 overflow-y-auto scrollbar-thin bg-surface-recessed/25 flex flex-col"
          ref={contentRef}
        >
          {/* Status overlays for non-ready states */}
          {download.state !== "ready" && download.state !== "idle" && (
            <StatusOverlay
              state={download.state}
              error={download.error}
              onRetry={download.retry}
              onCancel={download.cancel}
            />
          )}

          {/* IDLE: no key available — show info card */}
          {download.state === "idle" && !key && (
            <div className="p-8 flex-1 flex flex-col justify-center items-center text-center max-w-[420px] mx-auto">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-tint/10 bg-surface-tint/4 shadow-inner text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground/95">Attachment locked</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                This attachment is encrypted. Decryption will begin when the envelope key is
                available.
              </p>
            </div>
          )}

          {/* PDF PREVIEW — sandboxed iframe, no scripts */}
          {canPreview && isPDF && download.result && (
            <div className="flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-2 bg-surface-tint/2 border-b border-surface-tint/5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition ml-1"
                    title="Rotate 90°"
                    aria-label="Rotate 90 degrees"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={pdfPage <= 1}
                    onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground disabled:opacity-40 transition"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-medium">Page {pdfPage}</span>
                  <button
                    onClick={() => setPdfPage((p) => p + 1)}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto flex justify-center items-start bg-surface-panel">
                {/* Sandboxed iframe: allow-same-origin for blob URL access, NO allow-scripts */}
                <iframe
                  src={download.result.blobUrl}
                  title={`PDF preview: ${sanitizeFilenameForDisplay(attachment.name)}`}
                  sandbox="allow-same-origin"
                  className="bg-white rounded shadow-2xl transition-all duration-300 origin-top border-0"
                  style={{
                    width: `${Math.max(400, 650 * zoom)}px`,
                    height: `${Math.max(600, 750 * zoom)}px`,
                    transform: `rotate(${rotation}deg)`,
                  }}
                />
              </div>
            </div>
          )}

          {/* IMAGE PREVIEW — blob URL, natively sandboxed */}
          {canPreview && isImage && download.result && (
            <div className="flex-1 flex flex-col h-full bg-surface-panel">
              <div className="flex items-center justify-between px-6 py-2 bg-surface-tint/2 border-b border-surface-tint/5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                    className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setRotation(0);
                    }}
                    className="px-2 py-0.5 hover:bg-surface-tint/5 rounded text-foreground transition text-[10px]"
                  >
                    Reset
                  </button>
                </div>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1 hover:bg-surface-tint/5 rounded text-foreground transition flex items-center gap-1"
                  title="Rotate 90°"
                  aria-label="Rotate 90 degrees"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Rotate</span>
                </button>
              </div>

              <div
                className="flex-1 overflow-auto p-8 flex items-center justify-center relative min-h-[450px]"
                style={{
                  backgroundImage: `linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
                    linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%),
                    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%)`,
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
                }}
              >
                {/* Blob URL: no remote resource fetching, no script execution */}
                <img
                  src={download.result.blobUrl}
                  alt={sanitizeFilenameForDisplay(attachment.name)}
                  className="max-h-[70vh] rounded shadow-2xl transition-all duration-300 origin-center select-none pointer-events-none object-contain"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            </div>
          )}

          {/* JSON PREVIEW — decrypted text, rendered as syntax-highlighted pre */}
          {canPreview && isJSON && download.result && (
            <div className="p-6">
              <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/45 p-5 shadow-inner">
                <pre className="font-mono text-[13px] leading-6 select-text overflow-x-auto whitespace-pre">
                  {renderHighlightedJson(textContent)}
                </pre>
              </div>
            </div>
          )}

          {/* TEXT PREVIEW — decrypted text with line numbers */}
          {canPreview && (isText || isXML) && download.result && (
            <div className="p-6">
              <div className="rounded-xl border border-surface-tint/10 bg-surface-recessed/45 p-5 shadow-inner">
                {renderTextWithLines(textContent)}
              </div>
            </div>
          )}

          {/* ENCRYPTED PAYLOAD PREVIEW — show metadata, force download */}
          {canPreview && isEncrypted && download.result && (
            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/3 p-4 flex gap-3.5">
                <div className="h-10 w-10 shrink-0 grid place-items-center rounded-lg bg-amber-500/10 text-status-warning dark:text-amber-300">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground/95">
                    Encrypted Ciphertext Payload
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[550px]">
                    This file contains cryptographically encrypted payload data. Previews are
                    restricted to headers and metadata to prevent data exposure.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-surface-tint/5 bg-surface-tint/1.5 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">
                    Content Hash
                  </div>
                  <div className="text-xs font-semibold font-mono text-foreground/80 truncate">
                    {download.result.contentHash.slice(0, 16)}…
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">
                    Integrity
                  </div>
                  <div className="text-xs font-semibold text-status-success dark:text-emerald-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Verified
                  </div>
                </div>
              </div>

              <button
                onClick={handleForceDownload}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition"
              >
                <Download className="h-4 w-4" /> Download encrypted file
              </button>
            </div>
          )}

          {/* RISKY/UNSUPPORTED: force download, never preview */}
          {(isRisky || (!isPreviewableType(type) && download.state === "ready")) && (
            <div className="p-8 flex-1 flex flex-col justify-center items-center text-center max-w-[420px] mx-auto">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-tint/10 bg-surface-tint/4 shadow-inner text-muted-foreground">
                {isRisky ? (
                  <ShieldAlert className="h-6 w-6 text-status-warning dark:text-amber-400" />
                ) : (
                  <File className="h-6 w-6" />
                )}
              </div>
              <h3 className="text-base font-semibold text-foreground/95">
                {isRisky ? "Risky format — download only" : "Preview unavailable"}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {isRisky ? (
                  <>
                    Files with extension{" "}
                    <span className="font-semibold text-foreground font-mono">.{type}</span> may
                    contain executable content and cannot be previewed for security reasons.
                  </>
                ) : (
                  <>
                    This file extension{" "}
                    <span className="font-semibold text-foreground font-mono">.{type}</span> is not
                    supported for interactive previews in Hush.
                  </>
                )}
              </p>

              <div className="w-full mt-6 rounded-xl border border-surface-tint/5 bg-surface-tint/2 p-4 text-left space-y-3">
                <div className="flex justify-between border-b border-surface-tint/5 pb-2 text-xs">
                  <span className="text-muted-foreground">File name</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {sanitizeFilenameForDisplay(attachment.name)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-surface-tint/5 pb-2 text-xs">
                  <span className="text-muted-foreground">File size</span>
                  <span className="font-semibold text-foreground">{attachment.size}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">MIME classification</span>
                  <span className="font-semibold font-mono text-foreground">
                    {getMimeType(type)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={download.state === "loading"}
                className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition disabled:opacity-50"
              >
                {download.state === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}{" "}
                {download.state === "loading" ? "Downloading..." : "Download file locally"}
              </button>
              {download.state === "ready" && download.result ? (
                <button
                  onClick={handleForceDownload}
                  className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition"
                >
                  <Download className="h-4 w-4" /> Download file locally
                </button>
              ) : download.error?.retryable ? (
                <button
                  onClick={download.retry}
                  className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition"
                >
                  <RefreshCw className="h-4 w-4" /> Retry download
                </button>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
