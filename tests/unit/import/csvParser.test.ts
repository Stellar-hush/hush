import { describe, it, expect } from "vitest";
import {
  parseImportCsv,
  validateImportAddress,
  deduplicateRows,
} from "@/features/contacts/import/csvParser";

const G_ADDR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const S_ADDR = "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("validateImportAddress", () => {
  it("accepts valid Stellar G-address", () => {
    expect(validateImportAddress(G_ADDR)).toBeNull();
  });

  it("accepts valid Hush S-address", () => {
    expect(validateImportAddress(S_ADDR)).toBeNull();
  });

  it("accepts federation address", () => {
    expect(validateImportAddress("alice*stellar.org")).toBeNull();
  });

  it("rejects empty address", () => {
    expect(validateImportAddress("")).toBe("Address is required.");
  });

  it("rejects invalid address", () => {
    expect(validateImportAddress("not-an-address")).toContain("Not a valid");
  });
});

describe("parseImportCsv", () => {
  it("parses name,address CSV with header", () => {
    const csv = `name,address\nAlice,${G_ADDR}\nBob,${G_ADDR.replace("A", "B")}`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[0].error).toBeNull();
    expect(result[1].name).toBe("Bob");
  });

  it("parses headerless CSV (address only)", () => {
    const csv = G_ADDR;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("");
    expect(result[0].address).toBe(G_ADDR);
  });

  it("parses headerless CSV with two columns", () => {
    const csv = `Alice,${G_ADDR}\nBob,${G_ADDR.replace("A", "C")}`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[1].name).toBe("Bob");
  });

  it("handles quoted CSV values", () => {
    const csv = `"Alice","${G_ADDR}"`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("skips empty lines", () => {
    const csv = `name,address\n\nAlice,${G_ADDR}\n\n`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(1);
  });

  it("handles TSV with tab delimiter", () => {
    const csv = `name\taddress\nAlice\t${G_ADDR}`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("handles BOM prefix", () => {
    const csv = `\uFEFFname,address\nAlice,${G_ADDR}`;
    const result = parseImportCsv(csv);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseImportCsv("")).toEqual([]);
    expect(parseImportCsv("  ")).toEqual([]);
  });

  it("detects invalid addresses", () => {
    const csv = "Alice,not-an-address";
    const result = parseImportCsv(csv);
    expect(result[0].error).toContain("Not a valid");
  });
});

describe("deduplicateRows", () => {
  it("deduplicates by address (case-insensitive), last wins", () => {
    const rows = parseImportCsv("name,address\nAlice,GABC\nBob,GABC");
    const deduped = deduplicateRows(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].name).toBe("Bob");
  });

  it("keeps unique addresses", () => {
    const rows = parseImportCsv("name,address\nAlice,GABC\nBob,GXYZ");
    const deduped = deduplicateRows(rows);
    expect(deduped).toHaveLength(2);
  });
});
