import { describe, expect, it } from "vitest";
import * as fs from "fs";

import { openApiDocument } from "../../../src/server/api/openapi";

// Validates the OpenAPI document's examples/schemas relationship:
// every $ref resolves to a defined component schema, and any inline example
// is structurally consistent with its declared type. Fixed fixtures (no
// generated timestamps) keep validation deterministic.
describe("OpenAPI example/schema integrity", () => {
  const schemaNames = new Set(Object.keys(openApiDocument.components.schemas));
  const docString = JSON.stringify(openApiDocument);

  it("resolves every component schema reference", () => {
    const refs = [...docString.matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(schemaNames.has(ref), `schema ${ref} is defined`).toBe(true);
    }
  });

  it("declares reusable component schemas for shared domain types", () => {
    expect([...schemaNames]).toEqual(
      expect.arrayContaining([
        "StellarAddress",
        "Hash32",
        "StroopAmount",
        "MailboxPolicy",
        "PolicyEvaluationRequest",
        "PolicyEvaluationDecision",
      ]),
    );
  });

  it("every operation declares a summary (no empty documentation)", () => {
    for (const [path, ops] of Object.entries(openApiDocument.paths)) {
      for (const [method, op] of Object.entries(ops as Record<string, { summary?: string }>)) {
        expect(op.summary, `${method.toUpperCase()} ${path} summary`).toBeTruthy();
      }
    }
  });

  describe("policy evaluation OpenAPI documentation (#1330)", () => {
    const evalOp = openApiDocument.paths["/policies/evaluate"].post as any;

    it("documents requestBody with PolicyEvaluationRequest schema reference and examples", () => {
      expect(evalOp.requestBody).toBeDefined();

      const jsonContent = evalOp.requestBody.content["application/json"];
      expect(jsonContent.schema.$ref).toBe("#/components/schemas/PolicyEvaluationRequest");
      expect(jsonContent.examples).toHaveProperty("validEvaluation");
      expect(jsonContent.examples).toHaveProperty("malformedAddress");
      expect(jsonContent.examples).toHaveProperty("malformedPostage");
    });

    it("includes policy-denied response examples on HTTP 200", () => {
      const response200 = evalOp.responses["200"].content["application/json"];
      expect(response200.examples).toBeDefined();

      const examples = response200.examples;
      expect(examples).toHaveProperty("policySatisfied");
      expect(examples).toHaveProperty("senderAllowed");
      expect(examples).toHaveProperty("senderBlocked");
      expect(examples).toHaveProperty("unknownSendersDisabled");
      expect(examples).toHaveProperty("insufficientPostage");
      expect(examples).toHaveProperty("verificationRequired");

      // Verify policy denied examples have allowed: false
      expect(examples.senderBlocked.value.data.allowed).toBe(false);
      expect(examples.unknownSendersDisabled.value.data.allowed).toBe(false);
      expect(examples.insufficientPostage.value.data.allowed).toBe(false);
      expect(examples.verificationRequired.value.data.allowed).toBe(false);
    });

    it("includes malformed request validation failure examples on HTTP 422", () => {
      expect(evalOp.responses).toHaveProperty("422");
      const response422 = evalOp.responses["422"].content["application/json"];

      expect(response422.schema.$ref).toBe("#/components/schemas/ErrorEnvelope");
      expect(response422.examples).toHaveProperty("invalidStellarAddress");
      expect(response422.examples).toHaveProperty("invalidPostageAmount");

      expect(response422.examples.invalidStellarAddress.value.error.code).toBe("validation_error");
      expect(response422.examples.invalidPostageAmount.value.error.code).toBe("validation_error");
    });
  });

  it("generated openapi.json is valid JSON matching openApiDocument", () => {
    const rawFile = fs.readFileSync("openapi.json", "utf-8");
    const parsed = JSON.parse(rawFile);
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.paths["/policies/evaluate"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// #125: every documented example must validate against its declared schema.
// OpenAPI examples drift from schemas silently, so this block resolves every
// local component reference and runs each example value through a small
// JSON-Schema-subset validator covering the keywords this document uses.
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, any>;

interface ExampleSlot {
  /** Human-readable location, e.g. "POST /policies/evaluate request example 'validEvaluation'". */
  location: string;
  schema: JsonRecord;
  value: unknown;
}

/** Resolve a local `#/components/schemas/<Name>` reference, failing loudly on dangling refs. */
function resolveComponentRef(ref: string, doc: JsonRecord): JsonRecord {
  const match = /^#\/components\/schemas\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!match) {
    throw new Error(
      `Unsupported OpenAPI $ref target '${ref}': only '#/components/schemas/<Name>' is supported`,
    );
  }
  const name = match[1];
  const target = doc?.components?.schemas?.[name];
  if (!target) {
    throw new Error(
      `Dangling OpenAPI reference '${ref}': components.schemas has no entry named '${name}'`,
    );
  }
  return target;
}

/** Recursively inline every local $ref in a schema (cycle-safe). */
function dereference(schema: any, doc: JsonRecord, seen: string[] = []): any {
  if (Array.isArray(schema)) {
    return schema.map((entry) => dereference(entry, doc, seen));
  }
  if (schema !== null && typeof schema === "object") {
    if (typeof schema.$ref === "string") {
      if (seen.includes(schema.$ref)) {
        throw new Error(`Circular OpenAPI reference: ${[...seen, schema.$ref].join(" -> ")}`);
      }
      return dereference(resolveComponentRef(schema.$ref, doc), doc, [...seen, schema.$ref]);
    }
    const out: JsonRecord = {};
    for (const [key, value] of Object.entries(schema)) {
      out[key] = dereference(value, doc, seen);
    }
    return out;
  }
  return schema;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === "object") return "object";
  return `${typeof value} ${JSON.stringify(value)?.slice(0, 60)}`;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkFormat(format: string, value: string): string | null {
  if (format === "date-time") {
    return DATE_TIME_RE.test(value) ? null : `not a valid date-time: ${JSON.stringify(value)}`;
  }
  if (format === "email") {
    return EMAIL_RE.test(value) ? null : `not a valid email: ${JSON.stringify(value)}`;
  }
  // Unknown formats are annotations only (JSON Schema 2020-12 default).
  return null;
}

/** Validate a value against a (dereferenced) schema; returns human-readable errors. */
function validateValue(value: unknown, schema: any, path: string): string[] {
  const errors: string[] = [];
  if (schema === true || schema === undefined || schema === null) return errors;
  if (schema === false) return [`${path}: value present but schema is false`];
  if (schema.nullable === true && value === null) return errors;

  for (const sub of schema.allOf ?? []) {
    errors.push(...validateValue(value, sub, path));
  }
  if (schema.anyOf !== undefined) {
    const ok = (schema.anyOf as any[]).some((sub) => validateValue(value, sub, path).length === 0);
    if (!ok) errors.push(`${path}: does not match any anyOf branch`);
  }
  if (schema.oneOf !== undefined) {
    const matches = (schema.oneOf as any[]).filter(
      (sub) => validateValue(value, sub, path).length === 0,
    ).length;
    if (matches !== 1) {
      errors.push(`${path}: expected exactly one oneOf branch to match, got ${matches}`);
    }
  }
  if (schema.not !== undefined && validateValue(value, schema.not, path).length === 0) {
    errors.push(`${path}: matches the forbidden 'not' schema`);
  }

  if (schema.enum !== undefined && !schema.enum.some((e: unknown) => e === value)) {
    errors.push(
      `${path}: ${describeValue(value)} is not one of enum ${JSON.stringify(schema.enum)}`,
    );
  }
  if (schema.const !== undefined && schema.const !== value) {
    errors.push(
      `${path}: ${describeValue(value)} does not equal const ${JSON.stringify(schema.const)}`,
    );
  }

  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  if (types.length > 0 && !types.some((t: string) => typeMatches(value, t))) {
    errors.push(`${path}: expected type ${types.join("|")}, got ${describeValue(value)}`);
    return errors;
  }

  if (typeof value === "string") {
    if (schema.pattern !== undefined) {
      let re: RegExp;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        return [`${path}: schema pattern ${JSON.stringify(schema.pattern)} is not a valid RegExp`];
      }
      if (!re.test(value)) {
        errors.push(
          `${path}: ${JSON.stringify(value)} does not match pattern ${JSON.stringify(schema.pattern)}`,
        );
      }
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: string longer than maxLength ${schema.maxLength}`);
    }
    if (typeof schema.format === "string") {
      const formatError = checkFormat(schema.format, value);
      if (formatError) errors.push(`${path}: ${formatError}`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} is below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} is above maximum ${schema.maximum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push(`${path}: ${value} is not above exclusiveMinimum ${schema.exclusiveMinimum}`);
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      errors.push(`${path}: ${value} is not below exclusiveMaximum ${schema.exclusiveMaximum}`);
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord;
    for (const required of schema.required ?? []) {
      if (!(required in record)) {
        errors.push(`${path}: missing required property '${required}'`);
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, propValue] of Object.entries(record)) {
      if (key in properties) {
        errors.push(...validateValue(propValue, properties[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property '${key}' (additionalProperties: false)`);
      } else if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== true
      ) {
        errors.push(...validateValue(propValue, schema.additionalProperties, `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: array longer than maxItems ${schema.maxItems}`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        errors.push(...validateValue(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  return errors;
}

/** Collect every example slot in the document: media-type examples plus schema-level `example` fields. */
function collectExampleSlots(doc: JsonRecord): ExampleSlot[] {
  const slots: ExampleSlot[] = [];
  for (const [docPath, pathItem] of Object.entries<JsonRecord>(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries<JsonRecord>(pathItem ?? {})) {
      const label = `${method.toUpperCase()} ${docPath}`;
      const mediaTypes: Array<{ where: string; media: JsonRecord | undefined }> = [
        {
          where: "request",
          media: operation.requestBody?.content?.["application/json"],
        },
      ];
      for (const [status, response] of Object.entries<JsonRecord>(operation.responses ?? {})) {
        mediaTypes.push({
          where: `response ${status}`,
          media: response?.content?.["application/json"],
        });
      }
      for (const { where, media } of mediaTypes) {
        if (!media?.schema) continue;
        if (media.examples) {
          for (const [name, example] of Object.entries<JsonRecord>(media.examples)) {
            if (example && "value" in example) {
              slots.push({
                location: `${label} ${where} example '${name}'`,
                schema: media.schema,
                value: example.value,
              });
            }
          }
        }
        if ("example" in media) {
          slots.push({
            location: `${label} ${where} example`,
            schema: media.schema,
            value: media.example,
          });
        }
      }
    }
  }
  for (const [name, schema] of Object.entries<JsonRecord>(doc.components?.schemas ?? {})) {
    if (schema && typeof schema === "object" && "example" in schema) {
      slots.push({
        location: `schema '${name}' example`,
        schema,
        value: schema.example,
      });
    }
  }
  return slots;
}

describe("OpenAPI example value validation (#125)", () => {
  const slots = collectExampleSlots(openApiDocument);

  // These request examples document rejected input (their summaries say
  // "malformed"); they are checked separately to still be invalid.
  const intentionallyInvalid = new Set([
    "POST /policies/evaluate request example 'malformedAddress'",
    "POST /policies/evaluate request example 'malformedPostage'",
  ]);

  it("has documented examples to guard", () => {
    expect(slots.length).toBeGreaterThan(0);
    // Guard against the collector silently missing the known example families.
    const locations = slots.map((slot) => slot.location);
    expect(locations).toContain("POST /policies/evaluate request example 'validEvaluation'");
    expect(locations).toContain("schema 'PolicyEvaluationRequest' example");
  });

  it("validates every documented example value against its declared schema", () => {
    const failures: string[] = [];
    for (const slot of slots) {
      if (intentionallyInvalid.has(slot.location)) continue;
      let schema: any;
      try {
        schema = dereference(slot.schema, openApiDocument);
      } catch (err) {
        failures.push(`${slot.location}: ${(err as Error).message}`);
        continue;
      }
      failures.push(...validateValue(slot.value, schema, slot.location));
    }
    expect(failures).toEqual([]);
  });

  it("keeps intentionally-invalid request examples invalid", () => {
    for (const location of intentionallyInvalid) {
      const slot = slots.find((candidate) => candidate.location === location);
      expect(slot, `expected example slot ${location}`).toBeDefined();
      const schema = dereference(slot!.schema, openApiDocument);
      const errors = validateValue(slot!.value, schema, location);
      expect(errors.length, `${location} should still fail schema validation`).toBeGreaterThan(0);
    }
  });

  it("fails clearly on dangling component references", () => {
    expect(() => resolveComponentRef("#/components/schemas/DoesNotExist", openApiDocument)).toThrow(
      "Dangling OpenAPI reference '#/components/schemas/DoesNotExist': components.schemas has no entry named 'DoesNotExist'",
    );
  });

  it("uses valid fixed fixtures for timestamp examples", () => {
    const timestamps: string[] = [];
    const gather = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(gather);
      if (value !== null && typeof value === "object") {
        for (const [key, entry] of Object.entries(value as JsonRecord)) {
          if (key === "timestamp" && typeof entry === "string") timestamps.push(entry);
          else gather(entry);
        }
      }
    };
    for (const slot of slots) gather(slot.value);
    expect(timestamps.length).toBeGreaterThan(0);
    for (const timestamp of timestamps) {
      // Fixed ISO-8601 fixtures, never dynamically generated values.
      expect(DATE_TIME_RE.test(timestamp), `timestamp fixture ${timestamp}`).toBe(true);
    }
  });
});
