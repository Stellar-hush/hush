import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { processInboundEnvelope } from "@/features/mail/recipient-pipeline";
import { type KeyProvider } from "@/services/crypto/open-envelope";
import { createCommitment } from "@/services/crypto/commitment";
import { encodeAad } from "@/services/crypto/aad";
import { canonicalizePayload, type EnvelopePayload } from "@/services/crypto/envelope";
import { ENVELOPE_SIGNATURE_DOMAIN, type EnvelopeSignature } from "@/services/crypto/signature";
import { toHex } from "@/services/crypto/codec";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function keyProviderFor(key: CryptoKey, recipient: string): KeyProvider {
  return {
    resolveKey: async (r) => {
      if (r !== recipient) throw new Error("Key unavailable");
      return key;
    },
  };
}

async function buildTestEnvelope(
  body: string,
  key: CryptoKey,
  senderKp: Keypair,
  recipient: string,
  timestamp = "2026-07-23T12:00:00.000Z",
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(body);
  const aad = encodeAad({
    version: "v1",
    sender: senderKp.publicKey(),
    recipient,
    timestamp,
    attachments: [],
  });
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad as BufferSource },
      key,
      plaintext,
    ),
  );
  const tag = ct.slice(ct.length - 16);
  const commitment = await createCommitment(ct);

  const payload: EnvelopePayload = {
    version: "v1",
    sender: senderKp.publicKey(),
    recipient,
    timestamp,
    encryption_metadata: {
      algorithm: "AES-256-GCM",
      nonce: Array.from(iv)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      mac: Array.from(tag)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    },
    content_commitment: commitment,
    attachments: [],
  };

  const canonical = canonicalizePayload(payload);
  const dataToSign = Buffer.from(ENVELOPE_SIGNATURE_DOMAIN + canonical);
  const sigBytes = senderKp.sign(dataToSign);
  const signature: EnvelopeSignature = {
    scheme: "Ed25519",
    signerAddress: senderKp.publicKey(),
    value: toHex(new Uint8Array(sigBytes)),
  };

  return {
    input: {
      payload,
      ciphertext: toBase64(ct),
      signature,
    },
    key,
  };
}

describe("recipient-pipeline processInboundEnvelope", () => {
  it("successfully processes valid envelope with signature, safe rendering, and provenance", async () => {
    const senderKp = Keypair.random();
    const recipient = Keypair.random().publicKey();
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    const { input } = await buildTestEnvelope(
      "Hello recipient!\n\nStatus: Verified\nAmount: 10 XLM",
      key,
      senderKp,
      recipient,
    );

    const result = await processInboundEnvelope({
      input,
      keys: keyProviderFor(key, recipient),
      expectedRecipient: recipient,
      expectedSender: senderKp.publicKey(),
      requireSenderSignature: true,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.opened.body).toContain("Hello recipient!");
      expect(result.safeContent.blocks).toHaveLength(2);
      expect(result.provenance.senderVerified).toBe(true);
      expect(result.provenance.signatureVerified).toBe(true);
      expect(result.provenance.digest).toHaveLength(64);
    }
  });

  it("quarantines tampered envelopes without throwing uncaught errors", async () => {
    const senderKp = Keypair.random();
    const recipient = Keypair.random().publicKey();
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    const { input } = await buildTestEnvelope("Top secret", key, senderKp, recipient);
    // Tamper ciphertext
    const tamperedInput = {
      ...input,
      ciphertext: toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
    };

    const result = await processInboundEnvelope({
      input: tamperedInput,
      keys: keyProviderFor(key, recipient),
      expectedRecipient: recipient,
    });

    expect(result.status).toBe("quarantined");
    if (result.status === "quarantined") {
      expect(result.quarantineRecord.diagnosticId).toMatch(/^quar-[a-f0-9]{4}-[a-f0-9]{4}$/);
      expect(result.quarantineRecord.reasonCode).toBe("integrity_error");
      expect(result.quarantineRecord.userHeadline).toContain("Integrity Check Failed");
    }
  });

  it("quarantines envelopes when recipient binding fails", async () => {
    const senderKp = Keypair.random();
    const recipient = Keypair.random().publicKey();
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    const { input } = await buildTestEnvelope("For Alice", key, senderKp, recipient);

    const result = await processInboundEnvelope({
      input,
      keys: keyProviderFor(key, recipient),
      expectedRecipient: Keypair.random().publicKey(), // Different expected recipient
    });

    expect(result.status).toBe("quarantined");
    if (result.status === "quarantined") {
      expect(result.quarantineRecord.reasonCode).toBe("recipient_mismatch");
      expect(result.quarantineRecord.userHeadline).toBe("Recipient Binding Mismatch");
    }
  });

  it("handles large bodies and Unicode characters cleanly", async () => {
    const senderKp = Keypair.random();
    const recipient = Keypair.random().publicKey();
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    const unicodeBody =
      "🚀 Hush Network - Secure Mail 🔐\n\nGreeting: こんにちは / Bonjour / 🔒";
    const { input } = await buildTestEnvelope(unicodeBody, key, senderKp, recipient);

    const result = await processInboundEnvelope({
      input,
      keys: keyProviderFor(key, recipient),
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.opened.body).toBe(unicodeBody);
      expect(result.safeContent.rawCleanText).toBe(unicodeBody);
    }
  });
});
