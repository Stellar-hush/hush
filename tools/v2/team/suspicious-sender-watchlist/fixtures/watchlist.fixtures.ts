/**
 * watchlist.fixtures.ts — Suspicious Sender Watchlist
 *
 * Deterministic local fixtures. No network calls, no secrets.
 */

import type { WatchlistEntry } from "../types";

export const WATCHLIST_FIXTURES: WatchlistEntry[] = [
  {
    id: "watch-001",
    senderEmail: "noreply@phishing-stealth-alert.example.com",
    senderName: "Hush Security Alert",
    reason: "Known phishing domain impersonating security vendors",
    riskLevel: "high",
    status: "active",
    dateAdded: "2026-06-01",
    notes: "Flagged by 3 team members",
  },
  {
    id: "watch-002",
    senderEmail: "billing@fake-invoice-portal.example.net",
    senderName: "Invoice Portal",
    reason: "Fraudulent invoice sender; multiple reports from finance team",
    riskLevel: "high",
    status: "active",
    dateAdded: "2026-06-05",
  },
  {
    id: "watch-003",
    senderEmail: "promo@bulk-sender-spam.example.org",
    senderName: "Promo Sender",
    reason: "High-volume unsolicited bulk mail",
    riskLevel: "medium",
    status: "active",
    dateAdded: "2026-06-08",
    notes: "Unsubscribe link non-functional",
  },
  {
    id: "watch-004",
    senderEmail: "support@lookalike-domain.example.com",
    senderName: "Customer Support",
    reason: "Lookalike domain for internal support address",
    riskLevel: "medium",
    status: "active",
    dateAdded: "2026-06-10",
  },
  {
    id: "watch-005",
    senderEmail: "newsletter@low-risk-sender.example.io",
    senderName: "Newsletter Service",
    reason: "Opted-in newsletter with occasional misleading subject lines",
    riskLevel: "low",
    status: "active",
    dateAdded: "2026-06-12",
  },
  {
    id: "watch-006",
    senderEmail: "old-threat@dismissed-example.com",
    senderName: "Former Threat Actor",
    reason: "Previously flagged; domain deactivated",
    riskLevel: "high",
    status: "dismissed",
    dateAdded: "2026-05-20",
    notes: "Domain confirmed dead; kept for audit trail",
  },
];

/** Convenience subset: active entries only */
export const ACTIVE_FIXTURES = WATCHLIST_FIXTURES.filter((e) => e.status === "active");

/** Convenience subset: high-risk entries only */
export const HIGH_RISK_FIXTURES = WATCHLIST_FIXTURES.filter((e) => e.riskLevel === "high");
