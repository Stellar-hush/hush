import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Command, LogOut, RefreshCw, type LucideIcon } from "lucide-react";
import {
  NotificationsIcon as Bell,
  CalendarIcon as Calendar,
  HelpIcon as CircleHelp,
  LaterIcon as Clock3,
  FilterIcon as Filter,
  FilesIcon as Paperclip,
  SearchIcon as Search,
  SettingsIcon as Settings,
  ProofIcon as ShieldCheck,
  ImportIcon as Upload,
  IdentityIcon as User,
} from "@/features/design-system/components/mail-icons";
import { cn } from "@/lib/utils";
import { NotificationsPanel } from "./NotificationsPanel";
import { TopbarSearch } from "./TopbarSearch";
import type { MailFilters, Email } from "./data";
import type { InAppNotification } from "@/features/notifications";

/**
 * Shared keyboard + focus behavior for the topbar popovers.
 *
 * - Announces the expanded state on the trigger (`aria-expanded`).
 * - Moves focus into the popover panel on open.
 * - Closes on Escape and returns focus to the trigger.
 * - Restores focus to the trigger when the popover closes while focus is
 *   still inside it (Escape / click-outside), but never steals focus from an
 *   action the user already activated (e.g. a menu item that opened a dialog).
 */
function usePopoverFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables && focusables.length > 0) focusables[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const active = document.activeElement;
      const panel = panelRef.current;
      if (panel && active && panel.contains(active)) {
        triggerRef.current?.focus();
      }
    };
  }, [open, onClose]);

  return { panelRef, triggerRef };
}

type TopbarProps = {
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onOpenProofInspector: () => void;
  onImportContacts: () => void;
  onShowToast: (message: string) => void;
  onOpenShortcuts: () => void;
  filters: MailFilters;
  onFiltersChange: (filters: MailFilters) => void;
  onQuickAction: (action: "proofs" | "later" | "files") => void;
  onViewNotifications: () => void;
  onSignOut?: () => void;
  onOpenLogin?: () => void;
  notifications: InAppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  actor?: string | null;
  emails?: Email[];
  onSelectEmail?: (emailId: string, folder?: string) => void;
};

const quickActions: {
  label: string;
  value: string;
  action: "proofs" | "later" | "files";
  icon: LucideIcon;
}[] = [
  { label: "Proofs", value: "2", action: "proofs", icon: ShieldCheck },
  { label: "Later", value: "5", action: "later", icon: Clock3 },
  { label: "Files", value: "9", action: "files", icon: Paperclip },
];

export function Topbar({
  onOpenPalette,
  onOpenSettings,
  onOpenProofInspector,
  onImportContacts,
  onShowToast,
  onOpenShortcuts,
  filters,
  onFiltersChange,
  onQuickAction,
  onViewNotifications,
  onSignOut,
  onOpenLogin,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  actor,
  emails,
  onSelectEmail,
}: TopbarProps) {
  const [focused, setFocused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [account, setAccount] = useState<"personal" | "protocol">("personal");

  const filterRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const [filterRect, setFilterRect] = useState<DOMRect | null>(null);
  const [accountRect, setAccountRect] = useState<DOMRect | null>(null);
  const [helpRect, setHelpRect] = useState<DOMRect | null>(null);
  const [notifRect, setNotifRect] = useState<DOMRect | null>(null);

  const filterPopover = usePopoverFocus(filterOpen, () => setFilterOpen(false));
  const accountPopover = usePopoverFocus(accountOpen, () => setAccountOpen(false));
  const helpPopover = usePopoverFocus(helpOpen, () => setHelpOpen(false));
  const notificationsPopover = usePopoverFocus(notificationsOpen, () =>
    setNotificationsOpen(false),
  );

  useLayoutEffect(() => {
    if (filterOpen && filterRef.current) setFilterRect(filterRef.current.getBoundingClientRect());
  }, [filterOpen]);
  useLayoutEffect(() => {
    if (accountOpen && accountRef.current)
      setAccountRect(accountRef.current.getBoundingClientRect());
  }, [accountOpen]);
  useLayoutEffect(() => {
    if (helpOpen && helpRef.current) setHelpRect(helpRef.current.getBoundingClientRect());
  }, [helpOpen]);
  useLayoutEffect(() => {
    if (notificationsOpen && notificationsRef.current)
      setNotifRect(notificationsRef.current.getBoundingClientRect());
  }, [notificationsOpen]);

  useEffect(() => {
    // Only subscribe to global scroll/resize while a dropdown is actually open.
    // The scroll listener uses capture, so without this gate it would fire on
    // every scroll anywhere in the app (e.g. the email list and reader panes)
    // even when there is no open panel to reposition.
    const anyOpen = filterOpen || accountOpen || helpOpen || notificationsOpen;
    if (!anyOpen) return;

    const onReposition = () => {
      if (filterOpen && filterRef.current) setFilterRect(filterRef.current.getBoundingClientRect());
      if (accountOpen && accountRef.current)
        setAccountRect(accountRef.current.getBoundingClientRect());
      if (helpOpen && helpRef.current) setHelpRect(helpRef.current.getBoundingClientRect());
      if (notificationsOpen && notificationsRef.current)
        setNotifRect(notificationsRef.current.getBoundingClientRect());
    };
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [filterOpen, accountOpen, helpOpen, notificationsOpen]);

  return (
    <header className="glass relative z-50 m-0 flex h-14 items-center gap-2 overflow-hidden rounded-none border-t-0 px-3">
      <TopbarSearch
        actor={actor}
        emails={emails}
        onOpenPalette={onOpenPalette}
        onSelectEmail={onSelectEmail}
      />

      <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
        {quickActions.map((action) => (
          <QuickAction
            key={action.label}
            {...action}
            onClick={() => onQuickAction(action.action)}
          />
        ))}
      </div>

      <div className="glass-tile ml-auto flex shrink-0 items-center gap-1 rounded-[8px] px-1">
        {/* Filter dropdown */}
        <div ref={filterRef} className="relative">
          <IconBtn
            label="Filter"
            buttonRef={filterPopover.triggerRef}
            onClick={() => setFilterOpen(!filterOpen)}
            active={
              filterOpen ||
              filters.unreadOnly ||
              filters.hasAttachments ||
              filters.dateRange !== "all"
            }
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
          >
            <Filter className="h-4 w-4" />
          </IconBtn>
        </div>
        {typeof document !== "undefined" &&
          createPortal(
            <AnimatePresence>
              {filterOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setFilterOpen(false)}
                    className="fixed inset-0 z-[100] bg-overlay/40 backdrop-blur-xl"
                  />
                  <motion.div
                    ref={filterPopover.panelRef}
                    role="dialog"
                    aria-label="Filters"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    style={{
                      position: "fixed",
                      top: filterRect ? filterRect.bottom + 8 : 64,
                      right: filterRect ? Math.max(8, window.innerWidth - filterRect.right) : 12,
                      width: 224,
                      zIndex: 110,
                    }}
                    className="glass-modal overflow-hidden rounded-xl p-2"
                  >
                    <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Filters
                    </div>

                    <FilterToggle
                      icon={Check}
                      label="Unread only"
                      checked={filters.unreadOnly}
                      onChange={(v) => onFiltersChange({ ...filters, unreadOnly: v })}
                    />
                    <FilterToggle
                      icon={Paperclip}
                      label="Has attachments"
                      checked={filters.hasAttachments}
                      onChange={(v) => onFiltersChange({ ...filters, hasAttachments: v })}
                    />

                    <div className="my-2 border-t border-surface-tint/5" />

                    <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Date range
                    </div>

                    {(["all", "today", "week", "month"] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => onFiltersChange({ ...filters, dateRange: range })}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
                          filters.dateRange === range
                            ? "bg-surface-tint/[0.08] text-foreground"
                            : "text-muted-foreground hover:bg-surface-tint/[0.04] hover:text-foreground",
                        )}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="capitalize">
                          {range === "all"
                            ? "All time"
                            : range === "week"
                              ? "This week"
                              : range === "month"
                                ? "This month"
                                : "Today"}
                        </span>
                      </button>
                    ))}

                    {(filters.unreadOnly ||
                      filters.hasAttachments ||
                      filters.dateRange !== "all") && (
                      <>
                        <div className="my-2 border-t border-surface-tint/5" />
                        <button
                          onClick={() =>
                            onFiltersChange({
                              unreadOnly: false,
                              hasAttachments: false,
                              dateRange: "all",
                            })
                          }
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-surface-tint/[0.04] hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Clear filters
                        </button>
                      </>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}

        {/* Notifications */}
        <div ref={notificationsRef} className="relative">
          <IconBtn
            label="Notifications"
            buttonRef={notificationsPopover.triggerRef}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            active={notificationsOpen}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
          >
            <span className="relative">
              <Bell className="h-4 w-4" />
              <span className="pulse-dot absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand-highlight" />
            </span>
          </IconBtn>
        </div>
        <NotificationsPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          anchorRect={notifRect}
          panelRef={notificationsPopover.panelRef}
          onViewAll={onViewNotifications}
          notifications={notifications}
          onMarkRead={onMarkNotificationRead}
          onMarkAllRead={onMarkAllNotificationsRead}
        />

        {/* Import contacts */}
        <IconBtn label="Import contacts" onClick={onImportContacts}>
          <Upload className="h-4 w-4" />
        </IconBtn>

        <div ref={helpRef} className="relative">
          <IconBtn
            label="Help"
            buttonRef={helpPopover.triggerRef}
            onClick={() => setHelpOpen((open) => !open)}
            active={helpOpen}
            hint="?"
            aria-expanded={helpOpen}
            aria-haspopup="menu"
          >
            <CircleHelp className="h-4 w-4" />
          </IconBtn>
        </div>
        {typeof document !== "undefined" &&
          createPortal(
            <AnimatePresence>
              {helpOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setHelpOpen(false)}
                    aria-hidden="true"
                    className="fixed inset-0 z-[100] bg-surface-recessed/40 backdrop-blur-xl"
                  />
                  <motion.div
                    ref={helpPopover.panelRef}
                    role="menu"
                    aria-label="Help"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    style={{
                      position: "fixed",
                      top: helpRect ? helpRect.bottom + 8 : 64,
                      right: helpRect ? Math.max(8, window.innerWidth - helpRect.right) : 12,
                      width: 260,
                      zIndex: 110,
                    }}
                    className="glass-modal overflow-hidden rounded-xl p-1.5"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setHelpOpen(false);
                        onOpenShortcuts();
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-surface-tint/[0.06] hover:text-foreground"
                    >
                      <CircleHelp className="h-4 w-4" />
                      <span className="flex-1">Keyboard shortcuts</span>
                      <kbd className="rounded border border-surface-tint/10 bg-surface-recessed/30 px-1.5 py-0.5 font-mono text-[10px]">
                        ?
                      </kbd>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}

        {/* Proof Inspector */}
        <IconBtn label="Proof Inspector" onClick={onOpenProofInspector} hint="I">
          <ShieldCheck className="h-4 w-4" />
        </IconBtn>

        {/* Settings */}
        <IconBtn label="Settings" onClick={onOpenSettings} hint=",">
          <Settings className="h-4 w-4" />
        </IconBtn>

        <div className="mx-1 h-6 w-px bg-surface-tint/10" />

        {/* Account menu */}
        <div ref={accountRef} className="relative">
          <button
            ref={accountPopover.triggerRef}
            onClick={() => setAccountOpen(!accountOpen)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account menu"
            className={cn(
              "glow-ring flex items-center gap-2 rounded-[6px] border border-surface-tint/5 bg-surface-tint/[0.04] px-2 py-1.5 text-xs text-foreground transition hover:bg-surface-tint/[0.08]",
              accountOpen && "bg-surface-tint/[0.08]",
            )}
          >
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: "var(--gradient-account)" }}
            />
            <span className="hidden xl:inline">
              {account === "personal" ? "Personal" : "Protocol"}
            </span>
          </button>
        </div>
        {typeof document !== "undefined" &&
          createPortal(
            <AnimatePresence>
              {accountOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setAccountOpen(false)}
                    aria-hidden="true"
                    className="fixed inset-0 z-[100] bg-surface-recessed/40 backdrop-blur-xl"
                  />
                  <motion.div
                    ref={accountPopover.panelRef}
                    role="menu"
                    aria-label="Account"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    style={{
                      position: "fixed",
                      top: accountRect ? accountRect.bottom + 8 : 64,
                      right: accountRect ? Math.max(8, window.innerWidth - accountRect.right) : 12,
                      width: 224,
                      zIndex: 110,
                    }}
                    className="glass-modal overflow-hidden rounded-xl"
                  >
                    {/* Account info */}
                    <div className="border-b border-surface-tint/5 p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center"
                          style={{ background: "var(--gradient-avatar)" }}
                        >
                          <span className="text-sm font-medium text-white/90">EN</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {account === "personal" ? "Eve Navarro" : "Hush Protocol"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {account === "personal" ? "eve*stealth.xyz" : "team*stealth.network"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="p-1">
                      <AccountMenuItem
                        icon={User}
                        label="Profile"
                        onClick={() => {
                          setAccountOpen(false);
                          onOpenSettings();
                        }}
                      />
                      <AccountMenuItem
                        icon={RefreshCw}
                        label="Switch account"
                        onClick={() => {
                          setAccountOpen(false);
                          setAccount((current) =>
                            current === "personal" ? "protocol" : "personal",
                          );
                          onShowToast(
                            `Switched to ${
                              account === "personal" ? "Protocol" : "Personal"
                            } mailbox`,
                          );
                        }}
                      />
                      <AccountMenuItem
                        icon={User}
                        label="Sign in with password"
                        onClick={() => {
                          setAccountOpen(false);
                          onOpenLogin?.();
                        }}
                      />
                      <div className="my-1 border-t border-surface-tint/5" />
                      <AccountMenuItem
                        icon={LogOut}
                        label="Sign out"
                        onClick={() => {
                          setAccountOpen(false);
                          onShowToast("Signed out successfully");
                          onSignOut?.();
                        }}
                      />
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}
      </div>

      <AnimatePresence>
        {focused && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pointer-events-none absolute left-3 top-full mt-2 px-1 text-[11px] text-muted-foreground"
          >
            Press{" "}
            <kbd className="rounded border border-surface-tint/10 bg-surface-recessed/40 px-1">
              Ctrl+K
            </kbd>{" "}
            for the command palette
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  hint,
  buttonRef,
  className,
  ...rest
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "dialog" | "menu" | undefined;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      ref={buttonRef}
      aria-label={label}
      onClick={onClick}
      {...rest}
      className={cn(
        "glow-ring rounded-[6px] p-2 text-icon transition hover:bg-surface-tint/[0.06] hover:text-foreground",
        "inline-flex items-center justify-center gap-1.5 min-h-[36px] min-w-[36px]",
        active && "bg-surface-tint/[0.06] text-foreground",
        className,
      )}
    >
      {children}
      {hint && (
        <span className="hidden rounded border border-surface-tint/10 bg-surface-recessed/30 px-1 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline">
          {hint}
        </span>
      )}
    </motion.button>
  );
}

function QuickAction({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      aria-label={label}
      onClick={onClick}
      className="group glow-ring glass-tile flex h-9 items-center gap-2 rounded-[6px] px-2.5 text-xs text-muted-foreground transition hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden 2xl:inline">{label}</span>
      <span className="rounded-[4px] border border-surface-tint/[0.08] bg-surface-recessed/20 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
        {value}
      </span>
    </motion.button>
  );
}

function FilterToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
        checked
          ? "bg-surface-tint/[0.08] text-foreground"
          : "text-muted-foreground hover:bg-surface-tint/[0.04] hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {checked && <Check className="ml-auto h-3.5 w-3.5" />}
    </button>
  );
}

function AccountMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-surface-tint/[0.06] hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
