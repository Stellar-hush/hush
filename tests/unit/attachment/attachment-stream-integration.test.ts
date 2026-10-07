import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_STREAM_ALGORITHM,
  DEFAULT_CHUNK_SIZE_BYTES,
  MIN_CHUNK_SIZE_BYTES,
  MAX_CHUNK_SIZE_BYTES,
  encryptAttachmentStream,
  decryptAttachmentStream,
  generateAttachmentKey,
  type AttachmentStreamManifest,
  type EncryptedChunkFrame,
} from "../../../src/services/crypto/attachment-stream";

describe("attachment-stream integration", () => {
  async function* toAsyncSource(chunks: Uint8Array[]) {
    for (const chunk of chunks) yield chunk;
  }

  it("encrypts and decrypts a small file round-trip", async () => {
    const key = await generateAttachmentKey();
    const plaintext = new TextEncoder().encode("Hello, Hush attachment!");
    const source = [plaintext];

    const encrypted = encryptAttachmentStream(key, toAsyncSource(source), {
      chunkSizeBytes: MIN_CHUNK_SIZE_BYTES,
    });

    const frames: EncryptedChunkFrame[] = [];
    for await (const frame of encrypted.chunks) {
      frames.push(frame);
    }
    const manifest = await encrypted.manifest;

    expect(manifest.algorithm).toBe(ATTACHMENT_STREAM_ALGORITHM);
    expect(manifest.chunk_count).toBeGreaterThan(0);
    expect(manifest.total_size_bytes).toBe(plaintext.length);

    const chunks: EncryptedChunkFrame[] = frames.map((f) => ({ ...f }));
    async function* chunkIterable() {
      for (const c of chunks) yield c;
    }

    const decryptedChunks: Uint8Array[] = [];
    for await (const chunk of decryptAttachmentStream(key, manifest, chunkIterable())) {
      decryptedChunks.push(chunk);
    }

    const totalLength = decryptedChunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    expect(result).toEqual(plaintext);
  });

  it("encrypts and decrypts multi-chunk data", async () => {
    const key = await generateAttachmentKey();
    const plaintext = new Uint8Array(1024 * 3 + 100);
    crypto.getRandomValues(plaintext);
    const source = [plaintext];

    const encrypted = encryptAttachmentStream(key, toAsyncSource(source), {
      chunkSizeBytes: 1024,
    });

    const frames: EncryptedChunkFrame[] = [];
    for await (const frame of encrypted.chunks) {
      frames.push(frame);
    }
    const manifest = await encrypted.manifest;

    expect(manifest.chunk_count).toBe(4);
    expect(manifest.chunk_size).toBe(1024);
    expect(manifest.total_size_bytes).toBe(plaintext.length);

    async function* chunkIterable() {
      for (const c of frames) yield c;
    }

    const decryptedChunks: Uint8Array[] = [];
    for await (const chunk of decryptAttachmentStream(key, manifest, chunkIterable())) {
      decryptedChunks.push(chunk);
    }

    const totalLength = decryptedChunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    expect(result).toEqual(plaintext);
  });

  it("rejects decryption with wrong key", async () => {
    const key = await generateAttachmentKey();
    const wrongKey = await generateAttachmentKey();
    const plaintext = new TextEncoder().encode("Secret data");
    const source = [plaintext];

    const encrypted = encryptAttachmentStream(key, toAsyncSource(source));
    const frames: EncryptedChunkFrame[] = [];
    for await (const frame of encrypted.chunks) {
      frames.push(frame);
    }
    const manifest = await encrypted.manifest;

    async function* chunkIterable() {
      for (const c of frames) yield c;
    }

    await expect(
      (async () => {
        for await (const _chunk of decryptAttachmentStream(wrongKey, manifest, chunkIterable())) {
          // should throw
        }
      })(),
    ).rejects.toThrow();
  });

  it("detects corrupted chunk", async () => {
    const key = await generateAttachmentKey();
    const plaintext = new TextEncoder().encode("Corruption test data for verification");
    const source = [plaintext];

    const encrypted = encryptAttachmentStream(key, toAsyncSource(source), {
      chunkSizeBytes: MIN_CHUNK_SIZE_BYTES,
    });

    const frames: EncryptedChunkFrame[] = [];
    for await (const frame of encrypted.chunks) {
      frames.push(frame);
    }
    const manifest = await encrypted.manifest;

    if (frames.length > 0) {
      frames[0].ciphertext = btoa("corrupted");
    }

    async function* chunkIterable() {
      for (const c of frames) yield c;
    }

    await expect(
      (async () => {
        for await (const _chunk of decryptAttachmentStream(key, manifest, chunkIterable())) {
          // should throw
        }
      })(),
    ).rejects.toThrow();
  });
});
