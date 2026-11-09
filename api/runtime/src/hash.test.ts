import { describe, expect, it } from "vitest";
import { fingerprint, stableStringify } from "./hash";

describe("stableStringify", () => {
  it("sorts object keys recursively without changing array order", () => {
    expect(
      stableStringify({ z: 1, nested: { y: 2, a: 3 }, a: [2, 1] }),
    ).toBe('{"a":[2,1],"nested":{"a":3,"y":2},"z":1}');
  });

  it("omits undefined object properties and normalizes undefined array slots to null", () => {
    expect(stableStringify({ omitted: undefined, values: [undefined, 1] })).toBe(
      '{"values":[null,1]}',
    );
    expect(stableStringify([, 1])).toBe("[null,1]");
  });

  it("serializes valid dates as ISO-8601 strings", () => {
    expect(stableStringify({ at: new Date("2026-01-02T03:04:05.000Z") })).toBe(
      '{"at":"2026-01-02T03:04:05.000Z"}',
    );
  });

  it("rejects values that cannot be represented unambiguously as canonical JSON", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const unsupported: unknown[] = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1n,
      () => undefined,
      Symbol("value"),
      new Map(),
      new Set(),
      circular,
      new Date(Number.NaN),
    ];

    for (const value of unsupported) {
      expect(() => stableStringify(value)).toThrow(TypeError);
    }
  });

  it("rejects accessor properties rather than executing hidden serialization behavior", () => {
    const value = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => "value",
    });

    expect(() => stableStringify(value)).toThrow(/accessor properties/);
  });

  it("produces the same SHA-256 fingerprint for equivalent object key orderings", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
  });
});
