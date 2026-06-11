/**
 * hash.ts — SHA256 hashing over canonicalized JSON
 *
 * Produces a deterministic SHA256 hex digest from any object
 * by first canonicalizing it (deep sort + float normalization).
 */

import { createHash } from "node:crypto";
import { canonicalize } from "./canonicalize.js";

/**
 * Compute SHA256 hash of a canonicalized object (synchronous).
 * Returns a lowercase hex string.
 */
export function hashSync(obj: unknown): string {
  const canonical = canonicalize(obj);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Compute SHA256 hash of a canonicalized object (async, Web Crypto).
 * Returns a lowercase hex string.
 */
export async function hash(obj: unknown): Promise<string> {
  const canonical = canonicalize(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
