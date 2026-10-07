import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Plus, Sparkles, X, type LucideIcon } from "lucide-react";
import {
  ArchiveIcon as Archive,
  CalendarIcon as CalendarClock,
  LaterIcon as Clock3,
  DraftIcon as FileText,
  FolderIcon as Hash,
  InboxIcon as Inbox,
  EncryptedIcon as Lock,
  AllMailIcon as Mail,
  ReceiptIcon as ReceiptText,
  SentIcon as Send,
  SentIcon as SendHorizontal,
  SpamIcon as ShieldAlert,
  ProofIcon as ShieldCheck,
  StarredIcon as Star,
  TrashIcon as Trash2,
  ContactsIcon as Users,
  PriorityIcon,
} from "@/features/design-system/components/mail-icons";
import { cn } from "@/lib/utils";
import { ComposeButton } from "./ComposeButton";
import type { MailFolder } from "./data";
import { DROP_TARGET_FOLDERS } from "./useDragDrop";
import { formatMailAddress } from "@/features/identity/mail-domain";

type SidebarItem = { key: MailFolder; label: string; icon: LucideIcon };

const mailItems: SidebarItem[] = [
  { key: "all", label: "All Mail", icon: Mail },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "priority", label: "Priority", icon: PriorityIcon },
  { key: "snoozed", label: "Snoozed", icon: Clock3 },
  { key: "starred", label: "Starred", icon: Star },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "sent", label: "Sent", icon: Send },
];

const protocolItems: SidebarItem[] = [
  { key: "verified", label: "Verified", icon: ShieldCheck },
  { key: "pending", label: "Pending Proof", icon: Clock3 },
  { key: "requests", label: "Requests", icon: Users },
  { key: "encrypted", label: "Encrypted", icon: Lock },
];

const deliveryItems: SidebarItem[] = [
  { key: "receipts", label: "Receipts", icon: ReceiptText },
  { key: "outbox", label: "Outbox", icon: SendHorizontal },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock },
];

const storageItems: SidebarItem[] = [
  { key: "archive", label: "Archive", icon: Archive },
  { key: "spam", label: "Spam", icon: ShieldAlert },
  { key: "trash", label: "Trash", icon: Trash2 },
];

const sections: { title?: string; items: SidebarItem[] }[] = [
  { items: mailItems },
  { title: "Protocol", items: protocolItems },
  { title: "Delivery", items: deliveryItems },
  { title: "Storage", items: storageItems },
];

const defaultFolders = [
  { name: "Clients", color: "oklch(0.85 0.005 270)" },
  { name: "Investors", color: "oklch(0.75 0.005 270)" },
  { name: "Personal", color: "oklch(0.65 0.005 270)" },
];

const folderColors = [
  "oklch(0.85 0.005 270)",
  "oklch(0.75 0.005 270)",
  "oklch(0.65 0.005 270)",
  "oklch(0.80 0.02 200)",
  "oklch(0.80 0.02 150)",
];

export function Sidebar({
  active,
  counts,
  onSelect,
  collapsed,
  onToggle,
  onCompose,
  customFolder,
  onSelectCustomFolder,
  onDrop,
  onOpenSenderJourney,
}: {
  active: MailFolder;
  counts: Partial<Record<MailFolder, number>>;
  onSelect: (f: MailFolder) => void;
  collapsed: boolean;
  onToggle: () => void;
  onCompose: () => void;
  customFolder?: string | null;
  onSelectCustomFolder?: (name: string | null) => void;
  onDrop?: (emailIds: string[], target: MailFolder) => void;
  onOpenSenderJourney?: () => void;
}) {
  const [folders, setFolders] = useState(defaultFolders);
  const [isAddingFolder, setIsAddingFolder] = useState(false);

  const handleAddFolder = (name: string) => {
    const color = folderColors[folders.length % folderColors.length];
    setFolders([...folders, { name, color }]);
    setIsAddingFolder(false);
  };
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="glass relative z-10 hidden h-screen flex-col rounded-none border-y-0 border-l-0 p-3 md:flex"
    >
      <div className={cn("flex items-center gap-2 py-2", collapsed ? "justify-center" : "px-2")}>
        {!collapsed && (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="mail-preview-heading text-sm font-semibold tracking-tight brand-gradient-text">
              HUSH
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              mail protocol
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            "glow-ring shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground",
            !collapsed && "ml-auto",
          )}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <ComposeButton collapsed={collapsed} onCompose={onCompose} />

      {onOpenSenderJourney && (
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSenderJourney}
          className={cn(
            "group glow-ring mt-2 flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium",
            "border border-surface-tint/10 bg-emerald-500/10 text-status-success dark:text-emerald-300",
            "shadow-[0_8px_30px_-10px_rgba(0,0,0,0.6)] transition hover:bg-emerald-500/20",
            collapsed && "justify-center px-2",
          )}
        >
          <Users className="h-4 w-4" />
          {!collapsed && <span className="mail-preview-heading">Sender Journey</span>}
        </motion.button>
      )}

      <nav
        aria-label="Mail folders"
        tabIndex={0}
        className="scrollbar-thin mt-4 flex-1 overflow-y-auto pr-1"
      >
        {sections.map((section, sectionIndex) => (
          <div key={section.title ?? "mail"} className={sectionIndex === 0 ? "" : "mt-5"}>
            {section.title && !collapsed && (
              <div className="mail-preview-heading mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((it) => (
                <li key={it.key}>
                  <FolderButton
                    item={it}
                    count={counts[it.key]}
                    active={active === it.key}
                    collapsed={collapsed}
                    onSelect={() => onSelect(it.key)}
                    onDrop={
                      DROP_TARGET_FOLDERS.includes(it.key as import("./data").MailLocation)
                        ? (ids) => onDrop?.(ids, it.key)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {!collapsed && (
          <>
            <div className="mt-6 mb-2 flex items-center justify-between px-3">
              <span className="mail-preview-heading text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Folders
              </span>
              <button
                onClick={() => setIsAddingFolder(true)}
                className="glow-ring rounded p-1 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground"
                aria-label="Add folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Add folder input */}
            <AnimatePresence>
              {isAddingFolder && (
                <AddFolderInput onAdd={handleAddFolder} onCancel={() => setIsAddingFolder(false)} />
              )}
            </AnimatePresence>

            <ul className="space-y-0.5">
              {folders.map((f) => {
                const isCustomActive = customFolder === f.name;
                return (
                  <li key={f.name}>
                    <button
                      onClick={() => onSelectCustomFolder?.(isCustomActive ? null : f.name)}
                      aria-current={isCustomActive ? "page" : undefined}
                      aria-pressed={isCustomActive ? true : undefined}
                      className={cn(
                        "group glow-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-surface-tint/[0.04] hover:text-foreground",
                        isCustomActive
                          ? "bg-surface-tint/[0.06] text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Hash className="h-3.5 w-3.5" style={{ color: f.color }} />
                      <span className="mail-preview-heading">{f.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div
        className={cn(
          "mt-3 flex items-center gap-3 rounded-md border border-surface-tint/5 bg-surface-tint/[0.03] p-2",
          collapsed && "justify-center",
        )}
      >
        <div
          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"
          style={{ background: "var(--gradient-avatar)" }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/90">
            EN
          </span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium text-foreground">Uthaimin</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {formatMailAddress("kryputh")}
            </div>
          </div>
        )}
        {!collapsed && (
          <span className="pulse-dot ml-auto h-1.5 w-1.5 rounded-full bg-brand-highlight" />
        )}
      </div>
    </motion.aside>
  );
}

// Owns its own input state so typing a new folder name does not re-render the
// sidebar nav (all section items and FolderButtons) on every keystroke.
function AddFolderInput({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onAdd(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-2 overflow-hidden px-3"
    >
      <div className="flex items-center gap-2 rounded-lg border border-surface-tint/10 bg-surface-tint/[0.04] px-2 py-1.5">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Folder name"
          aria-label="Folder name"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />
        <button
          onClick={onCancel}
          className="rounded p-0.5 text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

function FolderButton({
  item,
  count,
  active,
  collapsed,
  onSelect,
  onDrop,
}: {
  item: SidebarItem;
  count?: number;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onDrop?: (emailIds: string[]) => void;
}) {
  const Icon = item.icon;
  const [isOver, setIsOver] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      aria-pressed={active ? true : undefined}
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setIsOver(true);
            }
          : undefined
      }
      onDragLeave={onDrop ? () => setIsOver(false) : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              setIsOver(false);
              try {
                const ids: string[] = JSON.parse(e.dataTransfer.getData("text/plain"));
                if (Array.isArray(ids) && ids.length > 0) onDrop(ids);
              } catch {
                /* ignore */
              }
            }
          : undefined
      }
      className={cn(
        "glow-ring relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
        "text-muted-foreground hover:bg-surface-tint/[0.04] hover:text-foreground",
        active && "text-foreground",
        collapsed && "justify-center px-2",
        isOver && "bg-surface-tint/[0.08] ring-1 ring-surface-tint/20 text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg"
          style={{
            background: "var(--gradient-glass)",
            boxShadow: "inset 0 0 0 1px var(--border)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className={cn("relative h-4 w-4 shrink-0", !active && "text-icon")} />
      {!collapsed && (
        <>
          <span className="mail-preview-heading relative truncate">{item.label}</span>
          {count !== undefined && count > 0 && (
            <span className="relative ml-auto text-[11px] tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </>
      )}
    </motion.button>
  );
}
