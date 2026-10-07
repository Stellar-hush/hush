import { OTPFixture } from "../types/otp";

export const OTP_FIXTURES: OTPFixture[] = [
  {
    id: "otp-001",
    senderLabel: "Hush Auth",
    senderDomain: "auth.stealth.xyz",
    type: "passkey",
    safeCode: "PASSKEY-AUTH",
    messagePreview: "Sign in to your Hush account using passkey...",
    status: "delivered",
    timestamp: "2026-06-16T10:00:00Z",
  },
  {
    id: "otp-002",
    senderLabel: "Acme Bank",
    senderDomain: "secure.acmebank.com",
    type: "email",
    safeCode: "482-911",
    messagePreview: "Your Acme Bank verification code is 482-911.",
    status: "pending",
    timestamp: "2026-06-16T10:15:00Z",
  },
  {
    id: "otp-003",
    senderLabel: "GitHub",
    senderDomain: "github.com",
    type: "email",
    safeCode: "839201",
    messagePreview: "Your GitHub authentication code is 839201. Please...",
    status: "delivered",
    timestamp: "2026-06-16T11:05:00Z",
  },
  {
    id: "otp-004",
    senderLabel: "Crypto Exchange",
    senderDomain: "login.crypto.io",
    type: "sms",
    safeCode: "229841",
    messagePreview: "Crypto Exchange verification code: 229841. Do not share...",
    status: "failed",
    timestamp: "2026-06-16T11:20:00Z",
  },
];
