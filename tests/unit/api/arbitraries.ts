import fc from "fast-check";

/**
 * Shared fast-check arbitraries for the Hush API domain: Stellar
 * addresses, 32-byte hashes, stroop/i128 amount strings, timestamps,
 * mailbox policies, postage, and receipts. Mirrors the exact validation
 * rules in `src/server/api/domain.ts` so "valid" arbitraries always parse
 * and "invalid" arbitraries always fail their corresponding schema.
 */

// ---------------------------------------------------------------------------
// Stellar addresses (`^G[A-Z2-7]{55}$` after trim + uppercase)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split("");
const BASE32_EXCLUDED_DIGITS = "0189".split("");

/** Canonical, already-normalized Stellar G-address. */
export const stellarAddressArbitrary: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...BASE32_ALPHABET), { minLength: 55, maxLength: 55 })
  .map((chars) => `G${chars.join("")}`);

/** A valid address wrapped in whitespace and/or lowercased, exercising `.trim().toUpperCase()`. */
export const stellarAddressUnnormalizedArbitrary: fc.Arbitrary<string> = fc
  .tuple(stellarAddressArbitrary, fc.boolean(), fc.constantFrom("", " ", "\t", "  \n"))
  .map(
    ([address, lowercase, padding]) =>
      `${padding}${lowercase ? address.toLowerCase() : address}${padding}`,
  );

/** Structurally invalid Stellar addresses: wrong prefix, wrong length, or disallowed characters. */
export const invalidStellarAddressArbitrary: fc.Arbitrary<string> = fc.oneof(
  stellarAddressArbitrary.map((address) => `M${address.slice(1)}`),
  stellarAddressArbitrary.map((address) => address.slice(0, -1)),
  stellarAddressArbitrary.map((address) => `${address}A`),
  fc
    .tuple(
      stellarAddressArbitrary,
      fc.nat({ max: 54 }),
      fc.constantFrom(...BASE32_EXCLUDED_DIGITS, "!", "_", "*"),
    )
    .map(([address, offset, badChar]) => {
      const target = 1 + offset;
      return address.slice(0, target) + badChar + address.slice(target + 1);
    }),
  fc.constant(""),
  fc.constant("not-an-address"),
);

// ---------------------------------------------------------------------------
// 32-byte hashes (`^[a-f0-9]{64}$` after trim + lowercase)
// ---------------------------------------------------------------------------

const HEX_ALPHABET = "0123456789abcdef".split("");

export const hash32Arbitrary: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...HEX_ALPHABET), { minLength: 64, maxLength: 64 })
  .map((chars) => chars.join(""));

/** A valid hash rendered in mixed case, exercising `.toLowerCase()` normalization. */
export const hash32UppercaseArbitrary: fc.Arbitrary<string> = hash32Arbitrary.map((hash) =>
  hash.toUpperCase(),
);

export const invalidHash32Arbitrary: fc.Arbitrary<string> = fc.oneof(
  hash32Arbitrary.map((hash) => hash.slice(0, -1)),
  hash32Arbitrary.map((hash) => `${hash}a`),
  fc
    .tuple(hash32Arbitrary, fc.nat({ max: 63 }), fc.constantFrom("g", "z", "!", "_", " "))
    .map(([hash, offset, badChar]) => hash.slice(0, offset) + badChar + hash.slice(offset + 1)),
  fc.constant(""),
);

// ---------------------------------------------------------------------------
// Stroop / i128 amount strings (`^(0|[1-9]\d*)$`, bounded by 2^127 - 1)
// ---------------------------------------------------------------------------

export const I128_MAX = 2n ** 127n - 1n;

export const stroopAmountArbitrary: fc.Arbitrary<string> = fc
  .bigInt({ min: 0n, max: I128_MAX })
  .map((value) => value.toString());

export const invalidStroopAmountArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.bigInt({ min: -I128_MAX, max: -1n }).map((value) => value.toString()),
  fc.constant((I128_MAX + 1n).toString()),
  fc.bigInt({ min: 0n, max: I128_MAX }).map((value) => `0${value.toString()}`),
  fc.constant("1.5"),
  fc.constant("abc"),
  fc.constant(""),
  fc.constant("1 23"),
  fc.constant("-0"),
);

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

const MIN_INSTANT = new Date("2000-01-01T00:00:00.000Z").getTime();
const MAX_INSTANT = new Date("2100-01-01T00:00:00.000Z").getTime();

/** An arbitrary point in time, as milliseconds since epoch. */
export const instantMsArbitrary: fc.Arbitrary<number> = fc.integer({
  min: MIN_INSTANT,
  max: MAX_INSTANT,
});

/** A UTC, `Z`-suffixed ISO-8601 timestamp — valid for `postage.createdAt` / idempotency records. */
export const utcTimestampArbitrary: fc.Arbitrary<string> = instantMsArbitrary.map((ms) =>
  new Date(ms).toISOString(),
);

/**
 * The same instant re-rendered with an explicit numeric offset instead of `Z`.
 * Valid for receipt fields (`{ offset: true }`) but rejected by the plain
 * `z.string().datetime()` used for `postage.createdAt`.
 */
export const offsetTimestampArbitrary: fc.Arbitrary<string> = fc
  .tuple(instantMsArbitrary, fc.integer({ min: -720, max: 720 }))
  .map(([instantMs, offsetMinutes]) => {
    const sign = offsetMinutes < 0 ? "-" : "+";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    const localMs = instantMs + offsetMinutes * 60_000;
    const local = new Date(localMs).toISOString().replace("Z", `${sign}${hh}:${mm}`);
    return local;
  });

// ---------------------------------------------------------------------------
// Composite domain records
// ---------------------------------------------------------------------------

export const mailboxPolicyArbitrary = fc.record({
  allowUnknown: fc.boolean(),
  minimumPostage: stroopAmountArbitrary,
  requireVerified: fc.boolean(),
});

export const postageStatusArbitrary: fc.Arbitrary<"pending" | "settled" | "refunded"> =
  fc.constantFrom("pending", "settled", "refunded");

export const senderRuleArbitrary: fc.Arbitrary<"default" | "allow" | "block"> = fc.constantFrom(
  "default",
  "allow",
  "block",
);

/** Two independently generated (and, for all practical purposes, distinct) Stellar addresses. */
export const distinctAddressPairArbitrary: fc.Arbitrary<[string, string]> = fc
  .tuple(stellarAddressArbitrary, stellarAddressArbitrary)
  .filter(([a, b]) => a !== b);

export const postageArbitrary = fc
  .tuple(
    stroopAmountArbitrary,
    utcTimestampArbitrary,
    hash32Arbitrary,
    hash32Arbitrary,
    distinctAddressPairArbitrary,
    postageStatusArbitrary,
  )
  .map(([amount, createdAt, messageId, paymentHash, [recipient, sender], status]) => ({
    amount,
    createdAt,
    messageId,
    paymentHash,
    recipient,
    sender,
    status,
  }));

/**
 * A receipt whose `deliveredAt`/`readAt` pair always satisfies the
 * `receiptSchema` ordering + future-skew invariants relative to `nowMs`.
 * `readAt` is `null` (unread) with 50% probability.
 */
export function validReceiptArbitrary(nowMs: number, maxFutureSkewMs: number) {
  return fc
    .tuple(
      hash32Arbitrary,
      distinctAddressPairArbitrary,
      fc.integer({ min: -365 * 24 * 60 * 60 * 1000, max: maxFutureSkewMs }),
      fc.option(fc.integer({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }), {
        nil: null,
      }),
    )
    .map(([messageId, [recipient, sender], deliveredOffsetMs, readExtraMs]) => {
      const deliveredAtMs = nowMs + deliveredOffsetMs;
      const deliveredAt = new Date(deliveredAtMs).toISOString();

      if (readExtraMs === null) {
        return { deliveredAt, messageId, readAt: null, recipient, sender };
      }

      const maxAllowedMs = nowMs + maxFutureSkewMs;
      const readAtMs = Math.min(deliveredAtMs + readExtraMs, maxAllowedMs);
      return {
        deliveredAt,
        messageId,
        readAt: new Date(readAtMs).toISOString(),
        recipient,
        sender,
      };
    });
}
