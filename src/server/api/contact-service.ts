import { defaultIdentityResolver } from "@/features/identity/resolver";
import type { ResolvedIdentity } from "@/features/identity/types";
import type { Contact, ContactUpdateInput, SenderRule } from "./domain";
import { contactSchema } from "./domain";
import { ApiError } from "./errors";
import { getKeyDirectory } from "./key-directory-service";
import { setSenderRule } from "./policy-service";
import type { ApiRepository, ContactQueryOptions, Page } from "./repository";
import { buildImportPreview, type ParsedImportRow } from "./contact-import";

// ---------------------------------------------------------------------------
// Issue #1973 (BETA-066) — Live contacts service
//
// Resolves every contact to a Hush identity, key-freshness, and sender
// trust state. Contact rows never mutate mailbox policy implicitly: the
// "trust" field only records the *intent*; policy writes happen through the
// explicit sender-rule endpoints (or the user's confirmed import).
// ---------------------------------------------------------------------------

export interface ContactResolution {
  identity: ResolvedIdentity | null;
  keyDirectory: Awaited<ReturnType<typeof getKeyDirectory>> | null;
  senderRule: SenderRule;
  senderRuleConfigured: boolean;
}

export interface ContactWithResolution {
  contact: Contact;
  resolution: ContactResolution;
}

export interface ContactListResult {
  items: ContactWithResolution[];
  nextContinuationKey: string | null;
}

const IDENTITY_RESOLUTION_TIMEOUT_MS = 2000;

function contactId(): string {
  return `c_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeOwner(owner: string): string {
  return owner.trim().toUpperCase();
}

async function resolveContact(
  repository: ApiRepository,
  owner: string,
  contact: Contact,
): Promise<ContactWithResolution> {
  const normOwner = normalizeOwner(owner);
  const resolution = await resolveContactState(repository, normOwner, contact);
  return { contact, resolution };
}

/**
 * Resolve the live identity, key-freshness, and trust state for a single
 * contact. Resolution failures degrade to `identity: null` (plus a non-fatal
 * error under `resolutionError`) rather than throwing, so a stale or
 * unreachable directory never breaks listing.
 */
export async function resolveContactState(
  repository: ApiRepository,
  owner: string,
  contact: Contact,
): Promise<ContactResolution> {
  const normOwner = normalizeOwner(owner);
  let identity: ResolvedIdentity | null = null;
  try {
    const result = await defaultIdentityResolver.resolve(contact.address, {
      repository,
      timeoutMs: IDENTITY_RESOLUTION_TIMEOUT_MS,
    });
    if (result.resolved) {
      identity = result;
    }
  } catch {
    identity = null;
  }

  let keyDirectory: ContactResolution["keyDirectory"] = null;
  const targetAddress = identity?.canonicalAddress ?? contact.canonicalAddress;
  if (targetAddress) {
    try {
      keyDirectory = await getKeyDirectory(repository, targetAddress);
    } catch {
      keyDirectory = null;
    }
  }

  const senderAddress = identity?.canonicalAddress ?? contact.address;
  let senderRule: SenderRule = "default";
  let senderRuleConfigured = false;
  try {
    const stored = await repository.getSenderRule(normOwner, senderAddress);
    senderRule = stored;
    senderRuleConfigured = stored !== "default";
  } catch {
    // A missing rule is indistinguishable from "default" by contract.
  }

  return { identity, keyDirectory, senderRule, senderRuleConfigured };
}

export async function listContacts(
  repository: ApiRepository,
  owner: string,
  options: ContactQueryOptions = {},
): Promise<ContactListResult> {
  const normOwner = normalizeOwner(owner);
  const page: Page<Contact> = await repository.listContacts(normOwner, options);
  const items = await Promise.all(
    page.items.map((contact) => resolveContact(repository, normOwner, contact)),
  );
  return { items, nextContinuationKey: page.nextContinuationKey };
}

export async function getContact(
  repository: ApiRepository,
  owner: string,
  contactId: string,
): Promise<ContactWithResolution> {
  const normOwner = normalizeOwner(owner);
  const contact = await repository.getContact(normOwner, contactId);
  if (!contact) {
    throw new ApiError(404, "not_found", `No contact found for ${contactId}`);
  }
  return resolveContact(repository, normOwner, contact);
}

export async function createContact(
  repository: ApiRepository,
  owner: string,
  input: { name: string; address: string; trust?: SenderRule },
): Promise<ContactWithResolution> {
  const normOwner = normalizeOwner(owner);
  const now = new Date().toISOString();
  const contact: Contact = {
    contactId: contactId(),
    owner: normOwner,
    name: input.name,
    address: input.address,
    canonicalAddress: null,
    trust: input.trust ?? "default",
    source: "manual",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const stored = await repository.createContact(contact);
  return resolveContact(repository, normOwner, stored);
}

export async function updateContact(
  repository: ApiRepository,
  owner: string,
  contactId: string,
  input: ContactUpdateInput,
): Promise<ContactWithResolution> {
  const normOwner = normalizeOwner(owner);
  const existing = await repository.getContact(normOwner, contactId);
  if (!existing) {
    throw new ApiError(404, "not_found", `No contact found for ${contactId}`);
  }

  const next: Contact = {
    ...existing,
    name: input.name ?? existing.name,
    address: input.address ?? existing.address,
    trust: input.trust ?? existing.trust,
    updatedAt: new Date().toISOString(),
  };

  // If the address changed, the previously resolved canonical address is stale.
  if (input.address !== undefined && input.address !== existing.address) {
    next.canonicalAddress = null;
  }

  const expectedVersion = input.expectedVersion ?? existing.version;
  const result = await repository.updateContact(next, expectedVersion);
  if (!result.updated) {
    if (result.current) {
      throw new ApiError(409, "conflict", "Contact was modified concurrently; re-read and retry");
    }
    throw new ApiError(404, "not_found", `No contact found for ${contactId}`);
  }
  return resolveContact(repository, normOwner, result.contact);
}

export async function deleteContact(
  repository: ApiRepository,
  owner: string,
  contactId: string,
): Promise<{ deleted: boolean; contactId: string }> {
  const normOwner = normalizeOwner(owner);
  await repository.deleteContact(normOwner, contactId);
  return { deleted: true, contactId };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeContactsInput {
  keepContactId: string;
  mergeContactIds: string[];
}

/**
 * Merges `mergeContactIds` into `keepContactId` (both scoped to `owner`).
 * The kept contact wins; every merged contact is deleted. Returns the
 * surviving contact re-resolved against live identity/trust state.
 */
export async function mergeContacts(
  repository: ApiRepository,
  owner: string,
  input: MergeContactsInput,
): Promise<ContactWithResolution> {
  const normOwner = normalizeOwner(owner);
  const { keepContactId, mergeContactIds } = input;
  if (mergeContactIds.includes(keepContactId)) {
    throw new ApiError(400, "bad_request", "Cannot merge a contact into itself");
  }
  if (new Set(mergeContactIds).size !== mergeContactIds.length) {
    throw new ApiError(400, "bad_request", "Duplicate contact IDs in merge list");
  }

  const keep = await repository.getContact(normOwner, keepContactId);
  if (!keep) {
    throw new ApiError(404, "not_found", `No contact found for ${keepContactId}`);
  }

  for (const mergeId of mergeContactIds) {
    const merged = await repository.getContact(normOwner, mergeId);
    if (!merged) {
      throw new ApiError(404, "not_found", `No contact found for ${mergeId}`);
    }
    if (merged.owner.toUpperCase() !== normOwner) {
      throw new ApiError(403, "forbidden", "Cannot merge a contact owned by another actor");
    }
  }

  for (const mergeId of mergeContactIds) {
    await repository.deleteContact(normOwner, mergeId);
  }

  // The kept record wins with a bumped version so concurrent writers cannot
  // resurrect a merged-away contact.
  const result = await repository.updateContact(keep, keep.version);
  if (!result.updated) {
    throw new ApiError(409, "conflict", "Contact was modified concurrently; re-read and retry");
  }
  return resolveContact(repository, normOwner, result.contact);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const IMPORT_MAX_ROWS = 1000;

export interface ContactImportPreviewResult {
  format: "csv" | "vcard";
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  truncated: boolean;
  limit: { maxRows: number };
  rows: Array<{
    rowNumber: number;
    name: string;
    address: string;
    status: "valid" | "duplicate" | "error";
    error: string | null;
    canonicalAddress: string | null;
    identityStatus: string | null;
    keyFreshness: string | null;
    existing: { contactId: string; trust: SenderRule } | null;
  }>;
}

export interface ContactImportCommitInput {
  rows: Array<{ name: string; address: string; trust?: SenderRule; source?: "csv" | "vcard" }>;
  /** When true, apply each row's trust as a sender rule for the owner. */
  applyTrust?: boolean;
}

export interface ContactImportCommitResult {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  total: number;
  appliedRules: number;
  contacts: Contact[];
}

function dedupeRows(rows: ParsedImportRow[]): ParsedImportRow[] {
  const seen = new Map<string, ParsedImportRow>();
  for (const row of rows) {
    const key = row.address.trim().toLowerCase();
    const prior = seen.get(key);
    if (prior) {
      // Keep the row with a name when one row lacks a name.
      if (!prior.name.trim() && row.name.trim()) {
        seen.set(key, row);
      }
    } else {
      seen.set(key, row);
    }
  }
  return [...seen.values()];
}

/**
 * Parses raw CSV/vCard content into a preview. Safe by construction: the
 * parser never writes, never mutates policy, and rejects malformed rows with
 * per-row errors instead of failing the whole file.
 */
export async function previewContactImport(
  repository: ApiRepository,
  owner: string,
  input: { format: "csv" | "vcard"; content: string },
): Promise<ContactImportPreviewResult> {
  const normOwner = normalizeOwner(owner);
  const { rows, truncated } = buildImportPreview(input.format, input.content, IMPORT_MAX_ROWS);
  const deduplicated = dedupeRows(rows);

  const resolved = await Promise.all(
    deduplicated.map(async (row) => {
      let canonicalAddress: string | null = null;
      let identityStatus: string | null = null;
      let keyFreshness: string | null = null;
      let existing: ContactImportPreviewResult["rows"][number]["existing"] = null;

      if (row.error === null) {
        try {
          const identity = await defaultIdentityResolver.resolve(row.address, {
            repository,
            timeoutMs: IDENTITY_RESOLUTION_TIMEOUT_MS,
          });
          if (identity.resolved) {
            canonicalAddress = identity.canonicalAddress;
            identityStatus = identity.status;
          }
        } catch {
          identityStatus = "unknown";
        }
      }

      if (canonicalAddress) {
        try {
          const dir = await getKeyDirectory(repository, canonicalAddress);
          const currentEnc = dir?.currentKeys.encryption;
          keyFreshness =
            currentEnc && currentEnc.status === "active"
              ? "active"
              : currentEnc
                ? currentEnc.status
                : "none";
        } catch {
          keyFreshness = "unknown";
        }

        const storedContact = await findExistingContact(repository, normOwner, canonicalAddress);
        if (storedContact) {
          existing = { contactId: storedContact.contactId, trust: storedContact.trust };
        }
      }

      return {
        rowNumber: row.rowNumber,
        name: row.name,
        address: row.address,
        status: row.error === null ? ("valid" as const) : ("error" as const),
        error: row.error,
        canonicalAddress,
        identityStatus,
        keyFreshness,
        existing,
      };
    }),
  );

  const statusCounts = resolved.reduce(
    (acc, row) => {
      if (row.status === "error") acc.errorRows += 1;
      else acc.validRows += 1;
      if (row.status !== "error" && row.existing) acc.duplicateRows += 1;
      return acc;
    },
    { validRows: 0, duplicateRows: 0, errorRows: 0 },
  );

  return {
    format: input.format,
    totalRows: rows.length,
    validRows: statusCounts.validRows,
    duplicateRows: statusCounts.duplicateRows,
    errorRows: statusCounts.errorRows,
    truncated,
    limit: { maxRows: IMPORT_MAX_ROWS },
    rows: resolved,
  };
}

async function findExistingContact(
  repository: ApiRepository,
  owner: string,
  address: string,
): Promise<Contact | null> {
  const normOwner = normalizeOwner(owner);
  const target = address.trim().toUpperCase();
  let after: string | undefined;
  for (;;) {
    const page = await repository.listContacts(normOwner, { limit: 100, after });
    const match = page.items.find(
      (contact) =>
        (contact.canonicalAddress ?? "").toUpperCase() === target ||
        contact.address.toUpperCase() === target,
    );
    if (match) return match;
    after = page.nextContinuationKey ?? undefined;
    if (after === undefined) return null;
  }
}

/**
 * Idempotently commits a validated import. Duplicate addresses are upserted
 * (create when absent, update when present) so re-running the same import
 * never creates duplicate contacts. Policy mutation is opt-in: `applyTrust`
 * must be explicitly confirmed by the user (defaults to false in the routes)
 * and even then only `allow`/`block` rows touch the sender-rule store.
 */
export async function commitContactImport(
  repository: ApiRepository,
  owner: string,
  input: ContactImportCommitInput,
): Promise<ContactImportCommitResult> {
  const normOwner = normalizeOwner(owner);
  const applyTrust = input.applyTrust ?? false;
  if (input.rows.length > IMPORT_MAX_ROWS) {
    throw new ApiError(400, "bad_request", `Import exceeds the ${IMPORT_MAX_ROWS} row limit`);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let rejected = 0;
  let appliedRules = 0;
  const contacts: Contact[] = [];

  for (const rawRow of input.rows) {
    const parsed = contactSchema
      .pick({ name: true, address: true })
      .safeParse({ name: rawRow.name, address: rawRow.address });
    if (!parsed.success) {
      rejected += 1;
      continue;
    }

    const existing = await findExistingContact(repository, normOwner, rawRow.address);
    const now = new Date().toISOString();
    let stored: Contact;

    if (existing) {
      const changed =
        existing.name !== parsed.data.name || existing.address !== parsed.data.address;
      if (!changed) {
        unchanged += 1;
        stored = existing;
      } else {
        const result = await repository.updateContact(
          { ...existing, name: parsed.data.name, updatedAt: now },
          existing.version,
        );
        if (!result.updated) {
          unchanged += 1;
          stored = existing;
        } else {
          updated += 1;
          stored = result.contact;
        }
      }
    } else {
      stored = await repository.createContact({
        contactId: contactId(),
        owner: normOwner,
        name: parsed.data.name,
        address: parsed.data.address,
        canonicalAddress: null,
        trust: "default",
        source: rawRow.source ?? "csv",
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      created += 1;
    }

    contacts.push(stored);

    const resolved = await resolveContactState(repository, normOwner, stored);
    const senderAddress = resolved.identity?.canonicalAddress ?? stored.address;
    const rule = rawRow.trust ?? "default";
    if (applyTrust && rule !== "default") {
      await setSenderRule(repository, normOwner, senderAddress, rule);
      appliedRules += 1;
    }
  }

  return {
    created,
    updated,
    unchanged,
    rejected,
    total: input.rows.length,
    appliedRules,
    contacts,
  };
}
