import { useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Calendar,
  CalendarRange,
  FileText,
  GitMerge,
  History,
  LayoutDashboard,
  Mail,
  Paperclip,
  PieChart,
  Shield,
  Target,
  X,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMPAIGN_TEMPLATES } from "./fixtures/campaignFixtures";
import type {
  DashboardNavItem,
  DashboardSection,
  DemoAdminDashboardProps,
  StatCard,
  PresetId,
  PresetAccount,
  PresetMail,
  PresetAuditEvent,
  PresetAttachment,
  PresetEvent,
} from "./types";
import { TemplatePicker } from "./templates";
import { AdminDataTable, type Column } from "./components/AdminDataTable";
import { CampaignsContent } from "./CampaignsContent";
import { PRESET_SCENARIOS } from "./fixtures/presets";
import { CampaignMessageAssignmentPanel } from "./components/CampaignMessageAssignmentPanel";
import { CampaignSnapshots } from "./components/CampaignSnapshots";
import { CampaignTimelinePanel } from "./components/CampaignTimelinePanel";
import type { Draft } from "./types/draft";

// ─── Default Deterministic fake data ──────────────────────────────────────────

const NAV_ITEMS: DashboardNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    description: "High-level demo system status",
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "Demo Stellar accounts and balances",
  },
  {
    id: "mail",
    label: "Mail",
    description: "Demo mail fixtures and delivery states",
  },
  {
    id: "attachments",
    label: "Attachments",
    description: "Demo mail attachment fixtures",
  },
  {
    id: "events",
    label: "Events",
    description: "Demo calendar and protocol events",
  },
  {
    id: "templates",
    label: "Templates",
    description: "Pick message templates to populate drafts",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    description: "Save and restore campaign draft snapshots",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Campaign phase timeline and milestones",
  },
  { id: "audit", label: "Audit", description: "Demo protocol event log" },
  {
    id: "analytics",
    label: "Analytics",
    description: "Privacy-preserving product analytics",
  },
];

const OVERVIEW_STATS: StatCard[] = [
  { label: "Active Accounts", value: "12", delta: "+2" },
  { label: "Messages Sent", value: "847", delta: "+12%" },
  { label: "Pending Requests", value: "3", delta: "-1" },
  { label: "Total Postage (XLM)", value: "1,240.5", delta: "+45.2" },
];

const ACCOUNTS_FAKE: PresetAccount[] = [
  {
    name: "Alice Demo",
    address: "GABCD...1234",
    balance: "500.0 XLM",
    type: "User",
  },
  {
    name: "Bob Demo",
    address: "GBCDE...2345",
    balance: "320.0 XLM",
    type: "User",
  },
  {
    name: "Relay East",
    address: "GCDEF...3456",
    balance: "1,200.0 XLM",
    type: "Relay",
  },
  {
    name: "Relay West",
    address: "GDEFG...4567",
    balance: "980.0 XLM",
    type: "Relay",
  },
];

const MAIL_FIXTURES: PresetMail[] = [
  {
    subject: "Welcome to Hush",
    status: "delivered",
    folder: "inbox",
    from: "Hush Team",
    email: "welcome*stealth.demo",
    body: "Hi there,\n\nYour Hush mailbox is set up. You decide who can reach you: trusted contacts arrive instantly, everyone else follows the policy you choose.\n\nReply any time to start a conversation.\n\n— The Hush demo team",
    time: "9:42 AM",
    unread: true,
    starred: true,
    labels: ["onboarding", "intro"],
    avatarColor: "#5b6470",
  },
  {
    subject: "Invoice #1042",
    status: "pending",
    folder: "requests",
    from: "Vendor Demo",
    email: "billing*stealth.demo",
    body: "Please find attached your invoice #1042.\n\nAmount: 120 XLM\nStatus: pending",
    time: "9:18 AM",
    unread: true,
    starred: false,
    labels: ["invoice"],
    avatarColor: "#7a8290",
  },
  {
    subject: "Meeting notes",
    status: "delivered",
    folder: "inbox",
    from: "Bob Demo",
    email: "bob*stealth.demo",
    body: "Here are the meeting notes from today's discussion.",
    time: "8:57 AM",
    unread: false,
    starred: false,
    labels: ["notes"],
    avatarColor: "#4d5560",
  },
  {
    subject: "Newsletter #47",
    status: "held",
    folder: "spam",
    from: "Newsletter System",
    email: "digest*stealth.demo",
    body: "Your weekly newsletter is ready to view.",
    time: "Yesterday",
    unread: false,
    starred: false,
    labels: ["digest"],
    avatarColor: "#9098a4",
  },
];

const AUDIT_EVENTS_FAKE: PresetAuditEvent[] = [
  {
    action: "Session started",
    actor: "demo-user-1",
    timestamp: "2026-06-16T09:00:00Z",
  },
  {
    action: "Policy default changed to request",
    actor: "demo-user-1",
    timestamp: "2026-06-16T09:05:00Z",
  },
  {
    action: "Sender approved: alice*stealth.demo",
    actor: "demo-user-1",
    timestamp: "2026-06-16T09:10:00Z",
  },
  {
    action: "Postage refunded for msg_abc123",
    actor: "system",
    timestamp: "2026-06-16T09:12:00Z",
  },
];

const ATTACHMENTS_FAKE: PresetAttachment[] = [
  {
    id: "att-inv-1042",
    fileName: "invoice_1042.pdf",
    fileSize: "120 KB",
    fileType: "PDF Document",
    messageSubject: "Invoice #1042",
    sender: "Vendor Demo",
  },
  {
    id: "att-roundtable",
    fileName: "roundtable_agenda.pdf",
    fileSize: "85 KB",
    fileType: "PDF Document",
    messageSubject: "You're invited: Hush demo roundtable",
    sender: "events*stealth.demo",
  },
];

const EVENTS_FAKE: PresetEvent[] = [
  {
    id: "evt-roundtable",
    title: "Hush demo roundtable",
    date: "2026-07-09",
    time: "3:00 PM",
    location: "Demo room",
    organizer: "events*stealth.demo",
    status: "confirmed",
  },
  {
    id: "evt-sync",
    title: "Weekly Sync",
    date: "2026-06-18",
    time: "10:00 AM",
    location: "Virtual",
    organizer: "bob*stealth.demo",
    status: "confirmed",
  },
];

// ─── Section icon map ─────────────────────────────────────────────────────────

const SECTION_ICON: Record<DashboardSection, React.ElementType> = {
  overview: LayoutDashboard,
  accounts: Shield, // Changed to Shield to match usage in OverviewContent
  mail: Mail,
  attachments: Paperclip,
  events: Calendar,
  templates: FileText,
  campaigns: History,
  timeline: CalendarRange,
  audit: Activity,
  analytics: PieChart,
};

// ─── Content region components ────────────────────────────────────────────────

const PRESET_OPTIONS = [
  {
    id: "none" as const,
    name: "Default System",
    desc: "Standard demo system stats and static fixtures.",
  },
  {
    id: "relay-verification" as const,
    name: "Relay Verification",
    desc: "Simulates registering and verifying a new relay node.",
  },
  {
    id: "proof-pending" as const,
    name: "Proof Pending",
    desc: "Simulates an on-chain cryptographic proof generation delay.",
  },
  {
    id: "receipt-settlement" as const,
    name: "Receipt Settlement",
    desc: "Simulates postage fees and read receipts confirming on-chain.",
  },
  {
    id: "encrypted-provenance" as const,
    name: "Encrypted & Provenance",
    desc: "Simulates encrypted payload delivery and cryptographic provenance verification on-chain.",
  },
] as const;

function OverviewContent({
  activePresetId,
  setActivePresetId,
  stats,
}: {
  activePresetId: PresetId;
  setActivePresetId: (id: PresetId) => void;
  stats: StatCard[];
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Summary of the demo environment. All data is synthetic and resets on each page load.
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-surface-tint/[0.06] bg-surface-tint/[0.02] p-4"
          >
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{stat.value}</p>
            {stat.delta && (
              <p className="mt-0.5 text-xs font-medium text-status-success dark:text-emerald-400">
                {stat.delta}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Preset Selector */}
      <div className="rounded-xl border border-surface-tint/[0.06] bg-surface-tint/[0.02] p-6 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-status-warning dark:text-amber-400" />
            Protocol Scenario Presets
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Select a preset to populate the dashboard tables with simulated ledger states, relay
            nodes, and pending proof mail flows.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {PRESET_OPTIONS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActivePresetId(preset.id);
                }}
                className={cn(
                  "glow-ring rounded-xl border p-4 text-left transition flex flex-col justify-between h-36 w-full active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                  active
                    ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20"
                    : "border-surface-tint/[0.06] bg-surface-tint/[0.02] hover:border-surface-tint/10 hover:bg-surface-tint/[0.04]",
                )}
              >
                <div>
                  <p className="text-xs font-semibold text-foreground">{preset.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                    {preset.desc}
                  </p>
                </div>
                <span
                  className={cn(
                    "mt-2 text-[10px] font-medium self-start px-2 py-0.5 rounded-full",
                    active
                      ? "bg-amber-500/20 text-status-warning dark:text-amber-400"
                      : "bg-surface-tint/5 text-muted-foreground",
                  )}
                >
                  {active ? "Active" : "Activate"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AccountsContent({
  accounts,
  selectedAccountAddress,
  setSelectedAccountAddress,
}: {
  accounts: PresetAccount[];
  selectedAccountAddress: string | null;
  setSelectedAccountAddress: (addr: string | null) => void;
}) {
  const columns: Column<PresetAccount>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        sortable: true,
        render: (acct) => (
          <div className="flex items-center gap-2">
            <span>{acct.name}</span>
            {acct.relayMetadata && (
              <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-medium text-status-info dark:text-indigo-400 border border-indigo-500/20">
                Inspectable
              </span>
            )}
          </div>
        ),
      },
      {
        key: "address",
        header: "Address",
        sortable: true,
        render: (acct) => (
          <span className="font-mono text-xs text-muted-foreground">{acct.address}</span>
        ),
      },
      {
        key: "balance",
        header: "Balance",
        sortable: true,
        sortValue: (acct) => parseFloat(acct.balance.replace(/[^0-9.]/g, "")),
        render: (acct) => <span className="tabular-nums">{acct.balance}</span>,
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        render: (acct) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              acct.type.includes("Relay") &&
                "bg-indigo-500/10 text-status-info dark:text-indigo-400",
              acct.type.includes("Contract") &&
                "bg-purple-500/10 text-status-special dark:text-purple-400",
              acct.type === "User" && "bg-surface-tint/5 text-muted-foreground",
            )}
          >
            {acct.type}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        sortValue: (acct) => acct.relayMetadata?.status ?? "none",
        render: (acct) => {
          const status = acct.relayMetadata?.status;
          if (!status) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium uppercase text-[9px] border",
                status === "verified" &&
                  "bg-emerald-500/10 text-status-success dark:text-emerald-400 border-emerald-500/20",
                status === "pending" &&
                  "bg-amber-500/10 text-status-warning dark:text-amber-400 border-amber-500/20",
                status === "failed" &&
                  "bg-rose-500/10 text-status-danger dark:text-rose-400 border-rose-500/20",
              )}
            >
              {status}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Demo Stellar accounts used for populating the inbox UI. Rows with metadata can be clicked to
        inspect details.
      </p>
      <AdminDataTable
        data={accounts}
        columns={columns}
        onRowClick={(acct) => {
          if (acct.relayMetadata) {
            setSelectedAccountAddress(
              selectedAccountAddress === acct.address ? null : acct.address,
            );
          }
        }}
        selectedRowKey={(acct) => selectedAccountAddress === acct.address}
        defaultSortKey="name"
      />
    </div>
  );
}

function MailContent({
  mail,
  selectedMailSubject,
  setSelectedMailSubject,
}: {
  mail: PresetMail[];
  selectedMailSubject: string | null;
  setSelectedMailSubject: (subject: string | null) => void;
}) {
  const columns: Column<PresetMail>[] = useMemo(
    () => [
      {
        key: "subject",
        header: "Subject",
        sortable: true,
        render: (item) => (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.subject}</span>
              {item.proofMetadata && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-status-success dark:text-emerald-400 border border-emerald-500/20">
                  Has Proof
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              From: {item.from} ({item.email})
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (item) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
              item.status === "delivered" &&
                "bg-emerald-500/10 text-status-success dark:text-emerald-400 border-emerald-500/20",
              item.status === "pending" &&
                "bg-amber-500/10 text-status-warning dark:text-amber-400 border-amber-500/20",
              item.status === "held" &&
                "bg-rose-500/10 text-status-danger dark:text-rose-400 border-rose-500/20",
            )}
          >
            {item.status}
          </span>
        ),
      },
      {
        key: "folder",
        header: "Folder",
        sortable: true,
        render: (item) => <span className="text-muted-foreground">{item.folder}</span>,
      },
      {
        key: "time",
        header: "Time",
        sortable: true,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Mail fixtures available for populating the demo inbox. Rows with cryptographic proofs can be
        clicked to inspect ledger details.
      </p>
      <AdminDataTable
        data={mail}
        columns={columns}
        onRowClick={(item) => {
          if (item.proofMetadata) {
            setSelectedMailSubject(selectedMailSubject === item.subject ? null : item.subject);
          }
        }}
        selectedRowKey={(item) => selectedMailSubject === item.subject}
        defaultSortKey="time"
        defaultSortDirection="desc"
      />
    </div>
  );
}

function AttachmentsContent({ attachments }: { attachments: PresetAttachment[] }) {
  const columns: Column<PresetAttachment>[] = useMemo(
    () => [
      {
        key: "fileName",
        header: "File Name",
        sortable: true,
        render: (att) => (
          <div className="flex items-center gap-2 font-medium">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{att.fileName}</span>
          </div>
        ),
      },
      {
        key: "fileSize",
        header: "Size",
        sortable: true,
      },
      {
        key: "fileType",
        header: "Type",
        sortable: true,
        render: (att) => (
          <span className="rounded bg-surface-tint/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-surface-tint/[0.04]">
            {att.fileType}
          </span>
        ),
      },
      {
        key: "messageSubject",
        header: "Source Message",
        sortable: true,
        render: (att) => <span className="text-muted-foreground">{att.messageSubject}</span>,
      },
      {
        key: "sender",
        header: "Sender",
        sortable: true,
        render: (att) => (
          <span className="font-mono text-xs text-muted-foreground">{att.sender}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Deterministic file attachments mock list, extracted from active mail fixtures.
      </p>
      <AdminDataTable data={attachments} columns={columns} defaultSortKey="fileName" />
    </div>
  );
}

function EventsContent({ events }: { events: PresetEvent[] }) {
  const columns: Column<PresetEvent>[] = useMemo(
    () => [
      {
        key: "title",
        header: "Title",
        sortable: true,
        render: (evt) => (
          <div className="flex items-center gap-2 font-medium">
            <Calendar className="h-3.5 w-3.5 text-status-warning dark:text-amber-400 shrink-0" />
            <span>{evt.title}</span>
          </div>
        ),
      },
      {
        key: "date",
        header: "Scheduled Time",
        sortable: true,
        sortValue: (evt) =>
          new Date(`${evt.date}T${evt.time.replace(" PM", "").replace(" AM", "")}`).getTime(),
        render: (evt) => (
          <span className="tabular-nums">
            {evt.date} · {evt.time}
          </span>
        ),
      },
      {
        key: "location",
        header: "Location",
        sortable: true,
        render: (evt) => <span className="text-muted-foreground">{evt.location}</span>,
      },
      {
        key: "organizer",
        header: "Organizer",
        sortable: true,
        render: (evt) => (
          <span className="font-mono text-xs text-muted-foreground">{evt.organizer}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (evt) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase text-[9px] border",
              evt.status === "confirmed" &&
                "bg-emerald-500/10 text-status-success dark:text-emerald-400 border-emerald-500/20",
              evt.status === "tentative" &&
                "bg-amber-500/10 text-status-warning dark:text-amber-400 border-amber-500/20",
              evt.status === "cancelled" &&
                "bg-rose-500/10 text-status-danger dark:text-rose-400 border-rose-500/20",
            )}
          >
            {evt.status}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Stellar node registration and verification events.
      </p>
      <AdminDataTable data={events} columns={columns} defaultSortKey="date" />
    </div>
  );
}

function AuditContent({ auditEvents }: { auditEvents: PresetAuditEvent[] }) {
  const columns: Column<PresetAuditEvent>[] = useMemo(
    () => [
      {
        key: "action",
        header: "Action",
        sortable: true,
        render: (evt) => (
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{evt.action}</span>
          </div>
        ),
      },
      {
        key: "actor",
        header: "Actor",
        sortable: true,
        render: (evt) => (
          <span className="font-mono text-xs text-muted-foreground">{evt.actor}</span>
        ),
      },
      {
        key: "timestamp",
        header: "Timestamp",
        sortable: true,
        sortValue: (evt) => new Date(evt.timestamp).getTime(),
        render: (evt) => (
          <span className="text-muted-foreground tabular-nums">
            {new Date(evt.timestamp).toLocaleString()}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Recent demo protocol events. No real user data or message body content is recorded.
      </p>
      <AdminDataTable
        data={auditEvents}
        columns={columns}
        defaultSortKey="timestamp"
        defaultSortDirection="desc"
      />
    </div>
  );
}

function TemplatesContent() {
  return <TemplatePicker />;
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────

export function DemoAdminDashboard({ className }: DemoAdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [activePresetId, setActivePresetId] = useState<PresetId>("none");
  const [selectedAccountAddress, setSelectedAccountAddress] = useState<string | null>(null);
  const [selectedMailSubject, setSelectedMailSubject] = useState<string | null>(null);

  const activePreset = useMemo(
    () => PRESET_SCENARIOS.find((p) => p.id === activePresetId),
    [activePresetId],
  );

  const stats = useMemo(() => (activePreset ? activePreset.stats : OVERVIEW_STATS), [activePreset]);
  const accounts = useMemo(
    () => (activePreset ? activePreset.accounts : ACCOUNTS_FAKE),
    [activePreset],
  );
  const mail = useMemo(() => (activePreset ? activePreset.mail : MAIL_FIXTURES), [activePreset]);
  const attachments = useMemo(
    () => (activePreset ? activePreset.attachments : ATTACHMENTS_FAKE),
    [activePreset],
  );
  const events = useMemo(() => (activePreset ? activePreset.events : EVENTS_FAKE), [activePreset]);
  const auditEvents = useMemo(
    () => (activePreset ? activePreset.auditEvents : AUDIT_EVENTS_FAKE),
    [activePreset],
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.address === selectedAccountAddress),
    [accounts, selectedAccountAddress],
  );
  const selectedMail = useMemo(
    () => mail.find((m) => m.subject === selectedMailSubject),
    [mail, selectedMailSubject],
  );

  const handleSectionChange = useCallback((section: DashboardSection) => {
    setActiveSection(section);
    setSelectedAccountAddress(null);
    setSelectedMailSubject(null);
  }, []);

  const handlePresetChange = useCallback((id: PresetId) => {
    setActivePresetId(id);
    setSelectedAccountAddress(null);
    setSelectedMailSubject(null);
  }, []);

  const Icon = SECTION_ICON[activeSection];

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-surface-tint/[0.08] bg-surface-recessed/60 backdrop-blur-xl",
        className,
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-surface-tint/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-tint/[0.06]">
            <BarChart3 className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Demo Admin Dashboard</h2>
            <p className="text-xs text-muted-foreground">Manage demo data for the Hush inbox UI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activePresetId !== "none" && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-status-warning dark:text-amber-400 border border-amber-500/20">
              Preset: {activePreset?.name}
            </span>
          )}
          <span className="rounded-full bg-surface-tint/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            Demo
          </span>
        </div>
      </div>

      {/* ── Navigation slots ── */}
      <nav
        className="flex gap-1 border-b border-surface-tint/[0.06] px-4 py-2"
        role="tablist"
        aria-label="Admin dashboard sections"
      >
        {NAV_ITEMS.map((item) => {
          const NavIcon = SECTION_ICON[item.id];
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`${item.id}-panel`}
              id={`${item.id}-tab`}
              aria-label={item.description}
              onClick={() => handleSectionChange(item.id)}
              className={cn(
                "glow-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/20",
                isActive
                  ? "bg-surface-tint/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-surface-tint/[0.04] hover:text-foreground",
              )}
            >
              <NavIcon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ── Content region ── */}
      <div
        id={`${activeSection}-panel`}
        className="flex-1 overflow-y-auto p-6"
        role="tabpanel"
        aria-labelledby={`${activeSection}-tab`}
      >
        <div className="mx-auto max-w-4xl">
          {/* Section header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground capitalize">{activeSection}</h3>
            </div>
            {activePresetId !== "none" && (
              <span className="text-xs text-status-warning dark:text-amber-400 font-medium">
                Simulated {activePreset?.name} flow active
              </span>
            )}
          </div>

          {activeSection === "overview" && (
            <OverviewContent
              activePresetId={activePresetId}
              setActivePresetId={handlePresetChange}
              stats={stats}
            />
          )}

          {activeSection === "accounts" && (
            <AccountsContent
              accounts={accounts}
              selectedAccountAddress={selectedAccountAddress}
              setSelectedAccountAddress={setSelectedAccountAddress}
            />
          )}

          {activeSection === "mail" && (
            <MailContent
              mail={mail}
              selectedMailSubject={selectedMailSubject}
              setSelectedMailSubject={setSelectedMailSubject}
            />
          )}

          {activeSection === "attachments" && <AttachmentsContent attachments={attachments} />}

          {activeSection === "events" && <EventsContent events={events} />}

          {activeSection === "templates" && <TemplatesContent />}

          {activeSection === "campaigns" && <CampaignsContent />}

          {activeSection === "timeline" && <div>Timeline Content</div>}

          {activeSection === "audit" && <AuditContent auditEvents={auditEvents} />}
        </div>
      </div>

      {/* ── Slide-out Inspection Panel (Drawer for Account/Relay Metadata) ── */}
      {selectedAccount && selectedAccount.relayMetadata && (
        <div className="absolute inset-y-0 right-0 z-40 w-96 border-l border-surface-tint/[0.08] bg-surface-recessed/95 p-6 shadow-2xl backdrop-blur-xl transition-all motion-reduce:transition-none flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-surface-tint/[0.06] pb-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Relay Node Inspector</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedAccount.name}</p>
              </div>
              <button
                type="button"
                aria-label="Close relay node inspector"
                onClick={() => setSelectedAccountAddress(null)}
                className="glow-ring rounded-md p-1 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <h5 className="text-[10px] uppercase tracking-wider text-status-info dark:text-indigo-400 font-semibold">
                Relay Registry Metadata
              </h5>
              <div className="space-y-3 rounded-lg border border-surface-tint/[0.04] bg-surface-tint/[0.01] p-3 text-xs leading-normal">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Node Address:</span>
                  <span className="font-mono text-foreground">
                    {selectedAccount.relayMetadata.nodeUri}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stellar Account:</span>
                  <span className="font-mono text-foreground text-[10px]">
                    {selectedAccount.address}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Routing Latency:</span>
                  <span className="text-foreground font-medium">
                    {selectedAccount.relayMetadata.latency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signature Scheme:</span>
                  <span className="text-foreground font-medium">
                    {selectedAccount.relayMetadata.signatureScheme}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Owner Account:</span>
                  <span className="font-mono text-foreground break-all text-[10px] block mt-0.5">
                    {selectedAccount.relayMetadata.owner}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verification Status:</span>
                  <span
                    className={cn(
                      "font-semibold uppercase text-[9px] px-1.5 py-0.5 rounded",
                      selectedAccount.relayMetadata.status === "verified" &&
                        "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
                      selectedAccount.relayMetadata.status === "pending" &&
                        "bg-amber-500/10 text-status-warning dark:text-amber-400 border border-amber-500/20",
                    )}
                  >
                    {selectedAccount.relayMetadata.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAccountAddress(null)}
            className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.02] py-2 text-xs font-semibold text-foreground hover:bg-surface-tint/5 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/20"
          >
            Close Inspector
          </button>
        </div>
      )}

      {/* ── Slide-out Inspection Panel (Drawer for Cryptographic Ledger Proof) ── */}
      {selectedMail && selectedMail.proofMetadata && (
        <div className="absolute inset-y-0 right-0 z-40 w-96 border-l border-surface-tint/[0.08] bg-surface-recessed/95 p-6 shadow-2xl backdrop-blur-xl transition-all motion-reduce:transition-none flex flex-col justify-between">
          <div className="space-y-6 overflow-y-auto flex-1 pr-1">
            <div className="flex items-start justify-between border-b border-surface-tint/[0.06] pb-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Ledger Proof Inspector</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedMail.subject}</p>
              </div>
              <button
                type="button"
                aria-label="Close ledger proof inspector"
                onClick={() => setSelectedMailSubject(null)}
                className="glow-ring rounded-md p-1 text-muted-foreground transition hover:bg-surface-tint/5 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <h5 className="text-[10px] uppercase tracking-wider text-status-success dark:text-emerald-400 font-semibold">
                Cryptographic Details
              </h5>
              <div className="space-y-3 rounded-lg border border-surface-tint/[0.04] bg-surface-tint/[0.01] p-3 text-xs leading-normal">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Message Hash:</span>
                  <span className="font-mono text-foreground break-all text-[10px] block mt-0.5">
                    {selectedMail.proofMetadata.messageHash}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">
                    Payment Preimage Hash:
                  </span>
                  <span className="font-mono text-foreground break-all text-[10px] block mt-0.5">
                    {selectedMail.proofMetadata.paymentHash}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Soroban Contract:</span>
                  <span className="font-mono text-foreground break-all text-[10px] block mt-0.5">
                    {selectedMail.proofMetadata.contractAddress}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Relay Latency:</span>
                  <span className="text-foreground font-medium">
                    {selectedMail.proofMetadata.latency}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">
                    Cryptographic Signature:
                  </span>
                  <span className="font-mono text-foreground break-all text-[10px] block mt-0.5">
                    {selectedMail.proofMetadata.signature}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Postage State:</span>
                  <span
                    className={cn(
                      "font-semibold uppercase text-[9px] px-1.5 py-0.5 rounded",
                      selectedMail.proofMetadata.postageStatus === "settled" &&
                        "bg-emerald-500/10 text-status-success dark:text-emerald-400 border border-emerald-500/20",
                      selectedMail.proofMetadata.postageStatus === "pending" &&
                        "bg-amber-500/10 text-status-warning dark:text-amber-400 border border-amber-500/20",
                    )}
                  >
                    {selectedMail.proofMetadata.postageStatus}
                  </span>
                </div>
                {selectedMail.folder === "encrypted" && (
                  <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] text-status-success dark:text-emerald-300 leading-relaxed">
                    <p className="font-semibold flex items-center gap-1.5 mb-1 text-xs text-status-success dark:text-emerald-400">
                      <Lock className="h-3 w-3" />
                      Payload Decryption Notes
                    </p>
                    This payload is fully end-to-end encrypted on-chain. Bob Demo decrypted it using
                    the ephemeral session key exchanged via Curve25519 and his private identity key.
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedMailSubject(null)}
            className="glow-ring w-full rounded-lg border border-surface-tint/10 bg-surface-tint/[0.02] py-2 text-xs font-semibold text-foreground hover:bg-surface-tint/5 transition mt-4 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-tint/20"
          >
            Close Inspector
          </button>
        </div>
      )}
    </div>
  );
}
