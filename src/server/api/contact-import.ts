import { contactSchema } from "./domain";

// ---------------------------------------------------------------------------
// Issue #1973 (BETA-066) — Safe CSV / vCard contact import parsing
//
// Pure parsing utilities shared by the import preview/commit routes. No I/O,
// no policy mutation: these functions only turn raw text into validated rows
// with per-row errors, so a malformed file degrades gracefully instead of
// aborting the whole import.
// ---------------------------------------------------------------------------

export type ImportFormat = "csv" | "vcard";

export type ParsedImportRow = {
  rowNumber: number;
  name: string;
  address: string;
  /** "csv" | "vcard" — recorded on the durable contact when committed. */
  source: "csv" | "vcard";
  error: string | null;
};

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;

function validateAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return "Address is required.";
  if (trimmed.length > MAX_ADDRESS_LENGTH) {
    return `Address exceeds ${MAX_ADDRESS_LENGTH} characters.`;
  }
  if (/^[GS][A-Z2-7]{55}$/.test(trimmed)) return null;
  if (trimmed.includes("*")) return null;
  if (contactSchema.shape.address.safeParse(trimmed).success) return null;
  return "Not a valid Hush/Stellar address or federation address (name*domain).";
}

function validateName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

// ---------------------------------------------------------------------------
// CSV / TSV parsing
// ---------------------------------------------------------------------------

const CSV_HEADER_PATTERNS = [
  /^name[,;\t]address$/i,
  /^address[,;\t]name$/i,
  /^full.?name[,;\t]email[,;\t]address$/i,
  /^email[,;\t]address$/i,
  /^address$/i,
];

function detectDelimiter(line: string): string {
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  const semi = (line.match(/;/g) || []).length;
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma && semi > tab) return ";";
  return ",";
}

function isCsvHeaderLine(line: string): boolean {
  const normalised = line.toLowerCase().replace(/ /g, "").replace(/["']/g, "");
  return CSV_HEADER_PATTERNS.some((pattern) => pattern.test(normalised));
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.replace(/^"|"$/g, "").trim());
}

export function parseCsv(raw: string): ParsedImportRow[] {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const hasHeader = isCsvHeaderLine(lines[0]);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const header = hasHeader
    ? lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/["']/g, ""))
    : [];

  const nameIdx = header.findIndex(
    (h) => h === "name" || h === "full name" || h === "full_name" || h === "fullname",
  );
  const addressIdx = header.findIndex(
    (h) => h === "address" || h === "stellar address" || h === "stellar_address" || h === "wallet",
  );
  const emailIdx = header.findIndex((h) => h === "email");

  const results: ParsedImportRow[] = [];
  for (let i = 0; i < dataLines.length; i += 1) {
    const parts = splitCsvLine(dataLines[i], delimiter);
    if (parts.length === 0) continue;

    let name = "";
    let address = "";

    if (hasHeader && nameIdx >= 0 && addressIdx >= 0) {
      name = parts[nameIdx]?.trim() ?? "";
      address = parts[addressIdx]?.trim() ?? "";
    } else if (hasHeader && emailIdx >= 0 && addressIdx >= 0) {
      name = parts[emailIdx]?.trim() ?? "";
      address = parts[addressIdx]?.trim() ?? "";
    } else if (hasHeader && addressIdx >= 0) {
      name = parts.length > 1 ? (parts[0]?.trim() ?? "") : "";
      address = parts[addressIdx]?.trim() ?? "";
    } else if (parts.length === 1) {
      address = parts[0].trim();
    } else {
      name = parts[0].trim();
      address = parts[1]?.trim() ?? "";
    }

    const error = validateAddress(address);
    if (error && !address && !name) continue;

    results.push({
      rowNumber: i + 1 + (hasHeader ? 1 : 0),
      name: validateName(name),
      address,
      source: "csv",
      error,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// vCard (v3/v4) parsing
// ---------------------------------------------------------------------------

export function parseVCard(raw: string): ParsedImportRow[] {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  const normalized = cleaned.replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/^END:VCARD$/gim)
    .map((block) => block.trim())
    .filter(Boolean);

  const results: ParsedImportRow[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block || !/^BEGIN:VCARD/i.test(block)) {
      continue;
    }

    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    let name = "";
    let address = "";
    const emailAddresses: string[] = [];

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex < 0) continue;
      const keyRaw = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).trim();
      const key = keyRaw.toUpperCase();

      if (key.startsWith("FN")) {
        name = value;
      } else if (key.startsWith("EMAIL")) {
        emailAddresses.push(value);
      } else if (key.startsWith("TEL")) {
        // Ignore phone numbers as addresses.
      }
    }

    if (!name) {
      // Fall back to N (structured name) when FN is missing.
      const nLine = lines.find((line) => line.toUpperCase().startsWith("N:"));
      if (nLine) {
        const [, value] = nLine.split(":");
        const [family, given] = value.split(";");
        name = [given, family].filter(Boolean).join(" ").trim();
      }
    }

    // Prefer a Hush/Stellar-shaped field, then any email.
    const stellarish = emailAddresses.find((email) => /^[GS][A-Z2-7]{55}$/.test(email.trim()));
    address = (stellarish ?? emailAddresses[0] ?? "").trim();

    const error = validateAddress(address);
    results.push({
      rowNumber: i + 1,
      name: validateName(name),
      address,
      source: "vcard",
      error,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Shared preview builder
// ---------------------------------------------------------------------------

export function buildImportPreview(
  format: ImportFormat,
  content: string,
  maxRows: number,
): { rows: ParsedImportRow[]; truncated: boolean } {
  const parsed = format === "vcard" ? parseVCard(content) : parseCsv(content);
  const truncated = parsed.length > maxRows;
  const rows = truncated ? parsed.slice(0, maxRows) : parsed;
  return { rows, truncated };
}
