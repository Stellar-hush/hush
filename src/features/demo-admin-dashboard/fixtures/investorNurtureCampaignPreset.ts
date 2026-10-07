import type { PresetScenario } from "../types";
import {
  mockDiagnosticId,
  mockMessageHash,
  mockPaymentHash,
  mockSignature,
} from "../mockHashHelpers";

/**
 * Campaign Preset: Investor Nurture
 *
 * This preset simulates an investor relations nurture campaign, covering
 * quarterly updates, follow-up prompts, report attachments, and reply
 * requests. It is designed to populate the dashboard with data for testing
 * investor-facing communication flows including postage, proofs, and
 * attachment delivery.
 *
 * All data is fake, deterministic, and safe for public repository review.
 * This is Campaign issue 16 of 50 for the Demo Admin Dashboard initiative.
 */
export const investorNurtureCampaignPreset: PresetScenario = {
  id: "investor-nurture",
  name: "Investor Nurture",
  description:
    "A campaign simulating investor relations communications: quarterly updates, follow-ups, report attachments, and reply prompts.",
  stats: [
    { label: "Investors Reached", value: "340" },
    { label: "Updates Sent", value: "4" },
    { label: "Reply Rate", value: "62%" },
    { label: "Reports Attached", value: "12" },
  ],
  accounts: [
    {
      name: "Hush IR Team",
      address: "ir*stealth.demo",
      balance: "8,200 XLM",
      type: "Organization",
    },
    {
      name: "Vertex Capital",
      address: "updates*vertexcap.demo",
      balance: "1,500 XLM",
      type: "Investor",
    },
    {
      name: "Meridian Fund",
      address: "contact*meridianfund.demo",
      balance: "900 XLM",
      type: "Investor",
    },
  ],
  mail: [
    {
      subject: "Q2 2026 Investor Update — Hush Protocol",
      status: "Delivered",
      folder: "inbox",
      from: "Hush IR Team",
      email: "ir*stealth.demo",
      body: "Dear investor,\n\nWe are pleased to share our Q2 2026 update. Key highlights: relay network expanded to 14 nodes, postage volume up 34%, and testnet contract upgrades shipped on schedule.\n\nThe full report is attached. Please reply with any questions.\n\n— Hush IR Team",
      time: "9:00 AM",
      unread: true,
      starred: true,
      labels: ["Investor", "Q2-Update", "Attachment"],
      avatarColor: "#2563eb",
      verifiedSender: true,
      receiptState: "sent",
      proofMetadata: {
        messageHash: mockMessageHash("inv-msg-1"),
        paymentHash: mockPaymentHash("inv-pay-1"),
        diagnosticId: mockDiagnosticId("inv-trace-1"),
        contractAddress: "CDINV...IR01",
        latency: "22ms",
        signature: mockSignature("inv-msg-1"),
        postageStatus: "settled",
      },
    },
    {
      subject: "Follow-up: Have you reviewed the Q2 report?",
      status: "Delivered",
      folder: "inbox",
      from: "Hush IR Team",
      email: "ir*stealth.demo",
      body: "Hi,\n\nWe wanted to follow up on the Q2 2026 investor update we sent last week. We would love to hear your thoughts and answer any questions you may have.\n\nPlease reply to this message or join our investor call on July 10.\n\n— Hush IR Team",
      time: "Yesterday",
      unread: false,
      starred: false,
      labels: ["Investor", "Follow-up"],
      avatarColor: "#2563eb",
      verifiedSender: true,
      receiptState: "sent",
      proofMetadata: {
        messageHash: mockMessageHash("inv-msg-2"),
        paymentHash: mockPaymentHash("inv-pay-2"),
        diagnosticId: mockDiagnosticId("inv-trace-2"),
        contractAddress: "CDINV...IR02",
        latency: "19ms",
        signature: mockSignature("inv-msg-2"),
        postageStatus: "settled",
      },
    },
    {
      subject: "Hush Protocol: Mid-year Roadmap Preview",
      status: "Delivered",
      folder: "inbox",
      from: "Hush IR Team",
      email: "ir*stealth.demo",
      body: "Dear partner,\n\nAttached is our mid-year roadmap preview. It covers the mainnet contract upgrade, new relay tiers, and the postage market expansion planned for H2 2026.\n\nWe welcome your input ahead of the investor call.\n\n— Hush IR Team",
      time: "3 days ago",
      unread: false,
      starred: false,
      labels: ["Investor", "Roadmap", "Attachment"],
      avatarColor: "#2563eb",
      verifiedSender: true,
      receiptState: "sent",
    },
    {
      subject: "Reply requested: Investor survey — 2 minutes",
      status: "Delivered",
      folder: "inbox",
      from: "Hush IR Team",
      email: "ir*stealth.demo",
      body: "Hi,\n\nWe are collecting brief feedback from investors ahead of our H2 planning cycle. The survey takes under 2 minutes.\n\nPlease reply to this message with your answers:\n1. How satisfied are you with the current update cadence?\n2. What metrics matter most to you?\n\nThank you for your time.\n\n— Hush IR Team",
      time: "1 week ago",
      unread: false,
      starred: false,
      labels: ["Investor", "Reply-Requested"],
      avatarColor: "#2563eb",
      verifiedSender: true,
      receiptState: "sent",
      proofMetadata: {
        messageHash: mockMessageHash("inv-msg-4"),
        paymentHash: mockPaymentHash("inv-pay-4"),
        diagnosticId: mockDiagnosticId("inv-trace-4"),
        contractAddress: "CDINV...IR04",
        latency: "25ms",
        signature: mockSignature("inv-msg-4"),
        postageStatus: "settled",
      },
    },
  ],
  attachments: [
    {
      id: "inv-att-1",
      fileName: "Hush-Q2-2026-Investor-Update.pdf",
      fileSize: "3.4 MB",
      fileType: "pdf",
      messageSubject: "Q2 2026 Investor Update — Hush Protocol",
      sender: "Hush IR Team",
    },
    {
      id: "inv-att-2",
      fileName: "Q2-2026-Financial-Summary.xlsx",
      fileSize: "210 KB",
      fileType: "xlsx",
      messageSubject: "Q2 2026 Investor Update — Hush Protocol",
      sender: "Hush IR Team",
    },
    {
      id: "inv-att-3",
      fileName: "Hush-Midyear-Roadmap-Preview.pdf",
      fileSize: "1.8 MB",
      fileType: "pdf",
      messageSubject: "Hush Protocol: Mid-year Roadmap Preview",
      sender: "Hush IR Team",
    },
  ],
  events: [
    {
      id: "evt-investor-call-q2",
      title: "Hush Q2 Investor Call",
      date: "2026-07-10",
      time: "3:00 PM",
      location: "Virtual — Hush Relay",
      organizer: "ir*stealth.demo",
      status: "confirmed",
    },
  ],
  auditEvents: [
    {
      action: "Campaign 'Investor Nurture' created",
      actor: "IR Admin",
      timestamp: "2026-06-01T08:00:00Z",
    },
    {
      action: "Q2 update sent to 340 investors",
      actor: "IR Admin",
      timestamp: "2026-06-16T09:00:00Z",
    },
    {
      action: "Follow-up sequence scheduled",
      actor: "IR Admin",
      timestamp: "2026-06-17T08:00:00Z",
    },
    {
      action: "Investor survey dispatched",
      actor: "IR Admin",
      timestamp: "2026-06-19T09:00:00Z",
    },
  ],
};
