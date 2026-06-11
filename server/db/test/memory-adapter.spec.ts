import { describe, expect, it } from "vitest";
import {
  MemoryAdapter,
  SignalConflictError,
  SignalVersionMismatchError,
} from "../index";

describe("@signal/db memory adapter", () => {
  it("inserts, queries, updates, counts, and removes documents", async () => {
    const db = new MemoryAdapter();

    const id = await db.insert("decisions", {
      _id: "decision-1",
      source: "signal",
      status: "open",
      tags: ["decision", "memory"],
    });

    expect(id).toBe("decision-1");
    expect(await db.isConnected()).toBe(true);
    expect(await db.exists("decisions", id)).toBe(true);
    expect(await db.findById("decisions", id)).toMatchObject({
      _id: id,
      status: "open",
      _version: 1,
    });
    expect(await db.find("decisions", { source: "signal" })).toHaveLength(1);
    expect(
      await db.find("decisions", { status: ["open", "paused"] }),
    ).toHaveLength(1);
    expect(await db.count("decisions", { source: "signal" })).toBe(1);

    await db.update(
      "decisions",
      id,
      { status: "closed" },
      { expectedVersion: 1 },
    );
    expect(await db.findOne("decisions", { status: "closed" })).toMatchObject({
      _version: 2,
    });

    await db.remove("decisions", id);
    expect(await db.exists("decisions", id)).toBe(false);
  });

  it("raises explicit conflicts and version mismatches", async () => {
    const db = new MemoryAdapter();
    await db.insert("decisions", { _id: "decision-1" });

    await expect(
      db.insert("decisions", { _id: "decision-1" }),
    ).rejects.toBeInstanceOf(SignalConflictError);
    await expect(
      db.update(
        "decisions",
        "decision-1",
        { status: "closed" },
        { expectedVersion: 3 },
      ),
    ).rejects.toBeInstanceOf(SignalVersionMismatchError);
    await expect(
      db.update("decisions", "missing", { status: "closed" }),
    ).rejects.toThrow(/not found/i);
  });

  it("treats null queries as null-or-missing and exposes test helpers", async () => {
    const db = new MemoryAdapter();

    await db.insert("items", { _id: "item-1", optional: null });
    await db.insert("items", { _id: "item-2" });
    await db.insert("items", { _id: "item-3", optional: "value" });

    expect(await db.find("items", { optional: null })).toHaveLength(2);
    expect(db.getCollections()).toEqual(["items"]);
    expect(db.getAllDocuments("items")).toHaveLength(3);

    db.clear();
    expect(db.getAllDocuments("items")).toHaveLength(0);
    await db.disconnect();
  });
});
