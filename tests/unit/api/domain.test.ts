import { describe, expect, it } from "vitest";

import {
  createReceiptSchema,
  hash32Schema,
  mailboxPolicySchema,
  receiptSchema,
  stellarAddressSchema,
  stroopAmountSchema,
} from "../../../src/server/api/domain";

const address = `G${"A".repeat(55)}`;
const validMessageId = "a".repeat(64);

describe("API domain schemas", () => {
  it("accepts contract-safe policy values", () => {
    expect(
      mailboxPolicySchema.parse({
        allowUnknown: false,
        minimumPostage: "10000000",
        requireVerified: true,
      }),
    ).toEqual({
      allowUnknown: false,
      minimumPostage: "10000000",
      requireVerified: true,
    });
  });

  it("enforces Stellar addresses and 32-byte hashes", () => {
    expect(stellarAddressSchema.parse(address)).toBe(address);
    // Add normalization tests for canonical address handling
    expect(stellarAddressSchema.parse(address.toLowerCase())).toBe(address);
    expect(stellarAddressSchema.parse(`  ${address.toLowerCase()}  `)).toBe(address);

    expect(hash32Schema.parse("a".repeat(64))).toBe("a".repeat(64));
    expect(() => stellarAddressSchema.parse("eve*stealth.xyz")).toThrow();
    expect(() => hash32Schema.parse("abc")).toThrow();
  });

  it("keeps Soroban i128 amounts as decimal strings", () => {
    expect(stroopAmountSchema.parse("9007199254740993")).toBe("9007199254740993");
    expect(() => stroopAmountSchema.parse("-1")).toThrow();
  });

  it("rejects overlong amount strings before integer parsing (#128)", () => {
    const maxI128 = (2n ** 127n - 1n).toString();
    expect(maxI128).toHaveLength(39);
    // Boundary: max i128 accepted, max + 1 rejected.
    expect(stroopAmountSchema.parse(maxI128)).toBe(maxI128);
    expect(() => stroopAmountSchema.parse((2n ** 127n).toString())).toThrow(
      "Amount exceeds Soroban i128",
    );
    // More than 39 digits can never fit i128: rejected without BigInt.
    expect(() => stroopAmountSchema.parse("9".repeat(40))).toThrow(
      "Amount exceeds Soroban i128",
    );
    expect(() => stroopAmountSchema.parse("1".repeat(1000))).toThrow(
      "Amount exceeds Soroban i128",
    );
    // Existing rules preserved: zero, canonical form, trimming, non-digits.
    expect(stroopAmountSchema.parse("0")).toBe("0");
    expect(() => stroopAmountSchema.parse("007")).toThrow();
    expect(stroopAmountSchema.parse("  100  ")).toBe("100");
    expect(() => stroopAmountSchema.parse("12a34")).toThrow();
  });

  describe("receiptSchema timestamp ordering and future bounds", () => {
    const baseReceipt = {
      messageId: validMessageId,
      sender: address,
      recipient: address,
    };

    it("accepts valid receipts with null readAt", () => {
      const nowStr = new Date().toISOString();
      const valid = {
        ...baseReceipt,
        deliveredAt: nowStr,
        readAt: null,
      };
      expect(receiptSchema.parse(valid)).toEqual(valid);
    });

    it("accepts valid receipts where readAt equals deliveredAt (exact boundary)", () => {
      const timestamp = new Date().toISOString();
      const valid = {
        ...baseReceipt,
        deliveredAt: timestamp,
        readAt: timestamp,
      };
      expect(receiptSchema.parse(valid)).toEqual(valid);
    });

    it("accepts valid receipts where readAt follows deliveredAt", () => {
      const delivered = new Date(Date.now() - 10000).toISOString();
      const read = new Date(Date.now() - 5000).toISOString();
      const valid = {
        ...baseReceipt,
        deliveredAt: delivered,
        readAt: read,
      };
      expect(receiptSchema.parse(valid)).toEqual(valid);
    });

    it("handles timezone-equivalent timestamps properly", () => {
      // 12:00:00 UTC is equivalent to 14:00:00+02:00
      const delivered = "2026-07-20T12:00:00Z";
      const readOffset = "2026-07-20T14:00:00+02:00";

      const schema = createReceiptSchema({
        now: () => new Date("2026-07-20T12:05:00Z"),
      });

      const valid = {
        ...baseReceipt,
        deliveredAt: delivered,
        readAt: readOffset,
      };
      expect(schema.parse(valid)).toEqual(valid);
    });

    it("rejects receipts where readAt precedes deliveredAt", () => {
      const delivered = new Date(Date.now() - 5000).toISOString();
      const read = new Date(Date.now() - 10000).toISOString();
      const invalid = {
        ...baseReceipt,
        deliveredAt: delivered,
        readAt: read,
      };

      expect(() => receiptSchema.parse(invalid)).toThrow("Read time cannot precede delivery time");
    });

    it("rejects excessively future deliveredAt timestamps", () => {
      const futureDelivered = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes in future
      const invalid = {
        ...baseReceipt,
        deliveredAt: futureDelivered,
        readAt: null,
      };

      expect(() => receiptSchema.parse(invalid)).toThrow(
        "Delivery timestamp is too far in the future",
      );
    });

    it("rejects excessively future readAt timestamps", () => {
      const nowStr = new Date().toISOString();
      const futureRead = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes in future
      const invalid = {
        ...baseReceipt,
        deliveredAt: nowStr,
        readAt: futureRead,
      };

      expect(() => receiptSchema.parse(invalid)).toThrow("Read timestamp is too far in the future");
    });

    it("supports custom maxFutureSkewMs and custom now provider", () => {
      const customNow = new Date("2026-07-20T12:00:00Z");
      const customSchema = createReceiptSchema({
        now: () => customNow,
        maxFutureSkewMs: 1000, // 1 second tolerance
      });

      // 2 seconds after customNow -> exceeds tolerance
      const futureDelivered = new Date(customNow.getTime() + 2000).toISOString();
      const invalid = {
        ...baseReceipt,
        deliveredAt: futureDelivered,
        readAt: null,
      };

      expect(() => customSchema.parse(invalid)).toThrow(
        "Delivery timestamp is too far in the future",
      );

      // 500ms after customNow -> within tolerance
      const validDelivered = new Date(customNow.getTime() + 500).toISOString();
      const valid = {
        ...baseReceipt,
        deliveredAt: validDelivered,
        readAt: null,
      };
      expect(customSchema.parse(valid)).toEqual(valid);
    });
  });
});
