import type { ImportedContactRow, ImportSource } from "./types";

/** Supported CSV column configurations. */
const HEADER_PATTERNS = [
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

function isHeaderLine(line: string): boolean {
  // Strip spaces and quotes (keep tabs for TSV header detection)
  const normalised = line.toLowerCase().replace(/ /g, "").replace(/["']/g, "");
  return HEADER_PATTERNS.some((p) => p.test(normalised));
}

/**
 * Validate a single address field.
 * Accepts Stellar G-address, Hush S-address, or federation (name*domain).
 */
export function validateImportAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return "Address is required.";
  if (/^[GS][A-Z2-7]{55}$/.test(trimmed)) return null;
  if (trimmed.includes("*")) return null;
  return "Not a valid Stellar/Hush address or federation address (name*domain).";
}

/**
 * Parse CSV/TSV text into ImportedContactRow[].
 * Handles multiple column layouts with or without headers.
 * Skips empty lines and strips BOM.
 * Optimized: pre-split all lines once, reuse delimiter detection.
 */
export function parseImportCsv(raw: string, source: ImportSource = "csv"): ImportedContactRow[] {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const hasHeader = isHeaderLine(lines[0]);
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

  const results: ImportedContactRow[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const parts = splitLine(line, delimiter);
    if (parts.length === 0) continue;

    let name: string;
    let address: string;

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
      name = "";
      address = parts[0].trim();
    } else if (parts.length === 2) {
      name = parts[0].trim();
      address = parts[1].trim();
    } else {
      name = parts[0].trim();
      address = parts[1]?.trim() ?? "";
    }

    const error = validateImportAddress(address);

    // Skip completely empty/invalid rows
    if (error && !address && !name) continue;

    results.push({
      id: `import-${source}-${i}-${timestamp}`,
      name,
      address,
      source,
      trust: "default",
      match: null,
      error,
    });
  }

  return results;
}

function splitLine(line: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
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

  return parts.map((p) => p.replace(/^"|"$/g, "").trim());
}

/**
 * Deduplicate rows by address (case-insensitive).
 * Later rows with the same address replace earlier ones.
 * Optimized: pre-normalize keys to avoid repeated toLowerCase() calls.
 */
export function deduplicateRows(rows: ImportedContactRow[]): ImportedContactRow[] {
  if (rows.length === 0) return rows;

  const seen = new Map<string, ImportedContactRow>();
  for (const row of rows) {
    const key = row.address.trim().toLowerCase();
    seen.set(key, row);
  }
  return [...seen.values()];
}
