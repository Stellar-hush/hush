import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Shield, Activity, Users, FileText, ArrowLeft, Bug } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-background dark:bg-neutral-950 text-status-neutral dark:text-neutral-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border dark:border-neutral-800 bg-card/50 dark:bg-neutral-900/50 backdrop-blur flex flex-col justify-between">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-border dark:border-neutral-800 flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-status-special dark:text-purple-400 rounded-lg">
              <Shield className="size-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wider uppercase">Hush Console</h1>
              <p className="text-xs text-muted-foreground dark:text-neutral-500">
                Beta Administrator
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link
              to="/admin"
              activeProps={{
                className:
                  "bg-secondary dark:bg-neutral-800 text-status-special dark:text-purple-400 font-medium",
              }}
              inactiveProps={{
                className:
                  "text-muted-foreground dark:text-neutral-400 hover:bg-accent/50 dark:hover:bg-neutral-800/50 hover:text-status-neutral dark:hover:text-neutral-200",
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all"
              activeOptions={{ exact: true }}
            >
              <Activity className="size-4" />
              <span>Health & Invites</span>
            </Link>
            <Link
              to="/admin/users"
              activeProps={{
                className:
                  "bg-secondary dark:bg-neutral-800 text-status-special dark:text-purple-400 font-medium",
              }}
              inactiveProps={{
                className:
                  "text-muted-foreground dark:text-neutral-400 hover:bg-accent/50 dark:hover:bg-neutral-800/50 hover:text-status-neutral dark:hover:text-neutral-200",
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all"
            >
              <Users className="size-4" />
              <span>User Lookup & CAS</span>
            </Link>
            <Link
              to="/admin/dlq"
              activeProps={{
                className:
                  "bg-secondary dark:bg-neutral-800 text-status-special dark:text-purple-400 font-medium",
              }}
              inactiveProps={{
                className:
                  "text-muted-foreground dark:text-neutral-400 hover:bg-accent/50 dark:hover:bg-neutral-800/50 hover:text-status-neutral dark:hover:text-neutral-200",
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all"
            >
              <FileText className="size-4" />
              <span>DLQ Monitoring</span>
            </Link>
            <Link
              to="/admin/feedback"
              activeProps={{
                className:
                  "bg-secondary dark:bg-neutral-800 text-status-special dark:text-purple-400 font-medium",
              }}
              inactiveProps={{
                className:
                  "text-muted-foreground dark:text-neutral-400 hover:bg-accent/50 dark:hover:bg-neutral-800/50 hover:text-status-neutral dark:hover:text-neutral-200",
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all"
            >
              <Bug className="size-4" />
              <span>Feedback Reports</span>
            </Link>
          </nav>
        </div>

        {/* Footer info & Return button */}
        <div className="p-4 border-t border-border dark:border-neutral-800 space-y-2">
          <div className="text-[11px] text-muted-foreground dark:text-neutral-500 font-mono text-center">
            Role: Authorized Operator
          </div>
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-secondary dark:bg-neutral-800 hover:bg-accent dark:hover:bg-neutral-700 text-status-neutral dark:text-neutral-300 hover:text-status-neutral dark:hover:text-neutral-100 rounded-lg text-xs transition-all"
          >
            <ArrowLeft className="size-3.5" />
            <span>Return to Inbox</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-background dark:bg-neutral-950 p-8">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
