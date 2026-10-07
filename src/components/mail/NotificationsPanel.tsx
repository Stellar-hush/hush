import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Bell, Check } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

import type { InAppNotification } from "@/features/notifications";

const icons = { mail: Mail, requests: Bell, failures: Bell, receipts: Check };

export function NotificationsPanel({
  open,
  onClose,
  anchorRect,
  panelRef,
  onViewAll,
  notifications,
  onMarkRead,
  onMarkAllRead,
}: {
  open: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  panelRef?: React.Ref<HTMLDivElement>;
  onViewAll: () => void;
  notifications: InAppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const panelWidth = typeof window !== "undefined" ? Math.min(360, window.innerWidth - 16) : 360;
  const top = anchorRect ? anchorRect.bottom + 8 : 64;
  const right = anchorRect
    ? Math.max(
        8,
        Math.min(window.innerWidth - panelWidth - 8, window.innerWidth - anchorRect.right),
      )
    : 8;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-[100] bg-overlay/40 backdrop-blur-xl"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={{
              position: "fixed",
              top,
              right,
              width: panelWidth,
              maxWidth: "calc(100vw - 16px)",
              zIndex: 110,
            }}
            className="glass-modal overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-tint/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-surface-tint/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-surface-tint/[0.06] hover:text-foreground"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close notifications"
                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-tint/[0.06] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Notifications list */}
            <ul className="max-h-[400px] overflow-y-auto divide-y divide-surface-tint/[0.04]">
              {notifications.map((n) => {
                const Icon = icons[n.category];
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-tint/[0.04]",
                        !n.read && "bg-surface-tint/[0.02]",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          !n.read ? "bg-surface-tint/10" : "bg-surface-tint/5",
                        )}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              "truncate text-sm",
                              !n.read ? "font-medium text-foreground" : "text-foreground/80",
                            )}
                          >
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-highlight" />
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {n.read && <Check className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Footer */}
            <div className="border-t border-surface-tint/5 px-4 py-2">
              <button
                onClick={() => {
                  onClose();
                  onViewAll();
                }}
                className="w-full rounded-lg py-2 text-xs text-muted-foreground transition hover:bg-surface-tint/[0.04] hover:text-foreground"
              >
                View all notifications
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
