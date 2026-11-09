import { createHash } from "node:crypto";

function serializeCanonicalJson(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical JSON does not support non-finite numbers");
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "undefined":
    case "bigint":
    case "symbol":
    case "function":
      throw new TypeError(`Canonical JSON does not support ${typeof value}`);
    case "object":
      break;
    default:
      throw new TypeError("Canonical JSON received an unsupported value");
  }

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new TypeError("Canonical JSON does not support circular references");
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Canonical JSON does not support invalid dates");
    }
    return JSON.stringify(value.toISOString());
  }

  ancestors.add(objectValue);
  try {
    if (Array.isArray(value)) {
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          entries.push("null");
          continue;
        }
        if (!("value" in descriptor)) {
          throw new TypeError("Canonical JSON does not support accessor properties");
        }
        entries.push(
          descriptor.value === undefined
            ? "null"
            : serializeCanonicalJson(descriptor.value, ancestors),
        );
      }
      return `[${entries.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only supports plain objects and arrays");
    }

    const enumerableSymbols = Object.getOwnPropertySymbols(value).filter(
      (symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol),
    );
    if (enumerableSymbols.length > 0) {
      throw new TypeError("Canonical JSON does not support symbol-keyed properties");
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    const entries: string[] = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError("Canonical JSON does not support accessor properties");
      }
      if (descriptor.value !== undefined) {
        entries.push(
          `${JSON.stringify(key)}:${serializeCanonicalJson(descriptor.value, ancestors)}`,
        );
      }
    }

    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(objectValue);
  }
}

/**
 * Serialize JSON-compatible values deterministically.
 *
 * Object keys are sorted by code-unit order. Undefined object properties are
 * omitted; undefined array entries and sparse array slots become null, matching
 * JSON serialization semantics. Unsupported JavaScript values are rejected
 * rather than silently producing ambiguous fingerprints.
 */
export function stableStringify(value: unknown): string {
  return serializeCanonicalJson(value, new WeakSet<object>());
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
