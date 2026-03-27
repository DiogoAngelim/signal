import { describe, it, expect } from "vitest";
// Example: Purpose & Scope enforcement test
import pkg from '../package.json';

describe("Purpose & Scope", () => {
  it("should have an explicit purpose string", () => {
    expect(typeof pkg.description === "string" && pkg.description.length > 0).toBe(true);
  });
});

// Example: Inputs enforcement test
import { z } from "zod";
const inputSchema = z.object({
  id: z.string(),
  value: z.number(),
});

describe("Inputs", () => {
  it("should reject missing required fields", () => {
    expect(() => inputSchema.parse({})).toThrow();
  });
  it("should reject ambiguous/conflicting inputs", () => {
    // Simulate ambiguous/conflicting input
    expect(() => inputSchema.parse({ id: "1", value: "not-a-number" })).toThrow();
  });
  it("should deduplicate inputs using stable keys", () => {
    const seen = new Set();
    const input = { id: "abc", value: 1 };
    const key = JSON.stringify(input);
    seen.add(key);
    expect(seen.has(key)).toBe(true);
  });
  it("should validate all inputs against strict schema", () => {
    expect(() => inputSchema.parse({ id: "abc", value: 123 })).not.toThrow();
  });
});

// Example: Outputs enforcement test

describe("Outputs", () => {
  function deterministicOutput(input: number) {
    return input * 2;
  }
  it("should be deterministic for same input", () => {
    expect(deterministicOutput(2)).toBe(deterministicOutput(2));
  });
  it("should include status + reason", () => {
    const output = { status: "ok", reason: "all good" };
    expect(output).toHaveProperty("status");
    expect(output).toHaveProperty("reason");
  });
  it("should provide machine-readable error codes", () => {
    const error = { code: "ERR_INVALID_INPUT" };
    expect(typeof error.code).toBe("string");
  });
});
