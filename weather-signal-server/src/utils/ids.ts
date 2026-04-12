import { randomUUID } from "node:crypto";

export function createId(): string {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return randomUUID();
}
