import { describe, expect, it } from "vitest";
import { DedupeStore } from "../src/utils/dedupe.js";

describe("dedupe store", () => {
  it("detects duplicates within ttl", () => {
    const store = new DedupeStore(60_000, 10);
    store.add("key-1");
    expect(store.has("key-1")).toBe(true);
  });
});
