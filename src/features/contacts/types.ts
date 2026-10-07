import type { UnknownSenderPolicy } from "@/features/preferences";

/** A single contact produced by the import wizard. */
export type ImportedContact = {
  id: string; // stable local id for React keys / editing
  name: string;
  address: string; // Hush / Stellar address or federation address
  trust: "allow" | "block" | "default";
  error: string | null; // validation error, null if valid
};

/** Trust level the user picks to apply to all "undecided" contacts before saving. */
export type BulkTrustDefault = UnknownSenderPolicy | "allow" | "block";
