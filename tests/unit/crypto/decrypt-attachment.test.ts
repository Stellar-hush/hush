import { describe, expect, it } from "vitest";

import { decryptAttachment, OpenEnvelopeError } from "../../../src/services/crypto/open-envelope";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encrypt an attachment with a known key.
 * Returns ciphertext WITH the appended GCM tag (matching sealEnvelope's storage format),
 * plus the tag separately in `mac` for the encryption_metadata.
 */
async function encryptAttachmentWithKey(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ ciphertext: string; nonce: string; mac: string; contentHash: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // crypto.subtle.encrypt returns ciphertext + 16-byte GCM tag appended.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv } as AesGcmParams,
      key,
      plaintext as BufferSource,
    ),
  );
  const tag = sealed.slice(sealed.length - 16);
  const contentHash = await sha256Hex(plaintext);

  return {
    // Full sealed output (ciphertext + tag), matching how sealEnvelope stores it.
    ciphertext: toBase64(sealed),
    nonce: toHex(iv),
    mac: toHex(tag),
    contentHash,
  };
}

describe("decryptAttachment (BETA-067)", () => {
  it("decrypts attachment bytes with a known key", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("Hello, Hush attachment!");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    const result = await decryptAttachment(key, {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      mac: encrypted.mac,
    });

    expect(new TextDecoder().decode(result.bytes)).toBe("Hello, Hush attachment!");
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies content hash when provided", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("hash-verify-me");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    const result = await decryptAttachment(key, {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      mac: encrypted.mac,
      expectedContentHash: encrypted.contentHash,
    });

    expect(result.contentHash).toBe(encrypted.contentHash);
  });

  it("rejects when content hash mismatches", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("hash-mismatch");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    await expect(
      decryptAttachment(key, {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        mac: encrypted.mac,
        expectedContentHash: "0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow(/content hash mismatch/);
  });

  it("rejects tampered ciphertext", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("tamper-me");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    // Tamper with the ciphertext by flipping a byte
    const ctBytes = Uint8Array.from(atob(encrypted.ciphertext));
    ctBytes[0] ^= 0xff;
    const tamperedCiphertext = toBase64(ctBytes);

    await expect(
      decryptAttachment(key, {
        ciphertext: tamperedCiphertext,
        nonce: encrypted.nonce,
        mac: encrypted.mac,
      }),
    ).rejects.toThrow(OpenEnvelopeError);
  });

  it("rejects wrong key", async () => {
    const key = await generateKey();
    const wrongKey = await generateKey();
    const plaintext = new TextEncoder().encode("wrong-key-test");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    await expect(
      decryptAttachment(wrongKey, {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        mac: encrypted.mac,
      }),
    ).rejects.toThrow(/decryption failed/);
  });

  it("rejects invalid ciphertext format", async () => {
    const key = await generateKey();

    await expect(
      decryptAttachment(key, {
        ciphertext: "!!!invalid-base64!!!",
        nonce: "aabbccdd00112233aabbccdd",
        mac: "aabbccdd00112233aabbccdd00112233",
      }),
    ).rejects.toThrow(/not valid base64/);
  });

  it("rejects malformed nonce", async () => {
    const key = await generateKey();

    await expect(
      decryptAttachment(key, {
        ciphertext: toBase64(new Uint8Array(32)),
        nonce: "not-a-valid-hex-nonce",
        mac: "aabbccdd00112233aabbccdd00112233",
      }),
    ).rejects.toThrow(/nonce is missing or malformed/);
  });

  it("rejects malformed mac", async () => {
    const key = await generateKey();

    await expect(
      decryptAttachment(key, {
        ciphertext: toBase64(new Uint8Array(32)),
        nonce: "aabbccdd00112233aabbccdd",
        mac: "short",
      }),
    ).rejects.toThrow(/mac is missing or malformed/);
  });

  it("rejects missing ciphertext", async () => {
    const key = await generateKey();

    await expect(
      decryptAttachment(key, {
        ciphertext: "",
        nonce: "aabbccdd00112233aabbccdd",
        mac: "aabbccdd00112233aabbccdd00112233",
      }),
    ).rejects.toThrow(/ciphertext is missing/);
  });

  it("rejects ciphertext shorter than auth tag", async () => {
    const key = await generateKey();

    // Only 8 bytes of ciphertext (GCM tag is 16 bytes)
    await expect(
      decryptAttachment(key, {
        ciphertext: toBase64(new Uint8Array(8)),
        nonce: "aabbccdd00112233aabbccdd",
        mac: "aabbccdd00112233aabbccdd00112233",
      }),
    ).rejects.toThrow(/shorter than auth tag/);
  });

  it("decrypts multiple attachments independently", async () => {
    const key = await generateKey();
    const att1 = new TextEncoder().encode("first attachment");
    const att2 = new TextEncoder().encode("second attachment with more data");

    const enc1 = await encryptAttachmentWithKey(key, att1);
    const enc2 = await encryptAttachmentWithKey(key, att2);

    const result1 = await decryptAttachment(key, {
      ciphertext: enc1.ciphertext,
      nonce: enc1.nonce,
      mac: enc1.mac,
    });
    const result2 = await decryptAttachment(key, {
      ciphertext: enc2.ciphertext,
      nonce: enc2.nonce,
      mac: enc2.mac,
    });

    expect(new TextDecoder().decode(result1.bytes)).toBe("first attachment");
    expect(new TextDecoder().decode(result2.bytes)).toBe("second attachment with more data");
  });

  it("fails closed on MAC mismatch (wrong tag)", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("mac-test");
    const encrypted = await encryptAttachmentWithKey(key, plaintext);

    await expect(
      decryptAttachment(key, {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        mac: "00000000000000000000000000000000",
      }),
    ).rejects.toThrow(/auth tag mismatch/);
  });

  it("handles binary data (non-text)", async () => {
    const key = await generateKey();
    const binaryData = new Uint8Array([0, 1, 2, 127, 128, 255, 200, 100]);
    const encrypted = await encryptAttachmentWithKey(key, binaryData);

    const result = await decryptAttachment(key, {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      mac: encrypted.mac,
      expectedContentHash: encrypted.contentHash,
    });

    expect(result.bytes).toEqual(binaryData);
    expect(result.contentHash).toBe(encrypted.contentHash);
  });
});
