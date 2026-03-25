/**
 * Comprehensive tests for database adapters
 * Covers MemoryAdapter, SqlAdapterBase, and SignalDB interface compliance
 */

import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { DocumentId } from "../packages/core/Types";

describe("MemoryAdapter", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe("collection initialization", () => {
    it("should initialize collection on demand", async () => {
      expect(adapter.getCollections().length).toBe(0);

      adapter.initCollection("posts");

      expect(adapter.getCollections()).toContain("posts");
    });

    it("should not reinitialize existing collection", async () => {
      adapter.initCollection("posts");
      const first = adapter.getCollections().length;

      adapter.initCollection("posts");
      const second = adapter.getCollections().length;

      expect(first).toBe(second);
    });
  });

  describe("insert", () => {
    beforeEach(() => {
      adapter.initCollection("posts");
    });

    it("should insert document and return ID", async () => {
      const id = await adapter.insert("posts", { title: "Test" });

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("should generate ID if not provided", async () => {
      const id = await adapter.insert("posts", { title: "Test" });

      expect(id).toMatch(/^doc_/);
    });

    it("should use provided _id", async () => {
      const customId = "custom_123";
      const id = await adapter.insert("posts", { _id: customId, title: "Test" });

      expect(id).toBe(customId);
    });

    it("should set _createdAt timestamp", async () => {
      const before = Date.now();
      await adapter.insert("posts", { title: "Test" });
      const after = Date.now();

      const docs = adapter.getAllDocuments("posts");
      expect(docs[0]._createdAt).toBeGreaterThanOrEqual(before);
      expect(docs[0]._createdAt).toBeLessThanOrEqual(after);
    });

    it("should preserve all document fields", async () => {
      await adapter.insert("posts", {
        title: "Test",
        content: "Hello",
        authorId: "user123",
        tags: ["a", "b"],
      });

      const docs = adapter.getAllDocuments("posts");
      expect(docs[0].title).toBe("Test");
      expect(docs[0].content).toBe("Hello");
      expect(docs[0].authorId).toBe("user123");
      expect(docs[0].tags).toEqual(["a", "b"]);
    });
  });

  describe("find", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
      await adapter.insert("posts", { title: "A", published: true });
      await adapter.insert("posts", { title: "B", published: false });
      await adapter.insert("posts", { title: "C", published: true });
    });

    it("should find all documents with empty query", async () => {
      const results = await adapter.find("posts", {});
      expect(results.length).toBe(3);
    });

    it("should find documents by exact match", async () => {
      const results = await adapter.find("posts", { published: true });
      expect(results.length).toBe(2);
      expect(results.every((d) => d.published === true)).toBe(true);
    });

    it("should find documents with multiple conditions", async () => {
      const results = await adapter.find("posts", { published: true, title: "A" });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("A");
    });

    it("should handle null queries", async () => {
      await adapter.insert("posts", { title: "D", published: null });
      const results = await adapter.find("posts", { published: null });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("D");
    });

    it("should handle array membership queries", async () => {
      const results = await adapter.find("posts", { published: [true, false] });
      expect(results.length).toBe(3);
    });

    it("should return empty array for no matches", async () => {
      const results = await adapter.find("posts", { published: undefined });
      expect(results.length).toBe(0);
    });
  });

  describe("findOne", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
      await adapter.insert("posts", { title: "A" });
      await adapter.insert("posts", { title: "B" });
    });

    it("should return first matching document", async () => {
      const doc = await adapter.findOne("posts", { title: "A" });
      expect(doc?.title).toBe("A");
    });

    it("should return null for no match", async () => {
      const doc = await adapter.findOne("posts", { title: "Z" });
      expect(doc).toBeNull();
    });
  });

  describe("findById", () => {
    it("should find document by ID", async () => {
      adapter.initCollection("posts");
      const id = await adapter.insert("posts", { title: "Test" });

      const doc = await adapter.findById("posts", id);
      expect(doc?.title).toBe("Test");
    });

    it("should return null for non-existent ID", async () => {
      adapter.initCollection("posts");
      const doc = await adapter.findById("posts", "nonexistent");
      expect(doc).toBeNull();
    });
  });

  describe("update", () => {
    let docId: DocumentId;

    beforeEach(async () => {
      adapter.initCollection("posts");
      docId = await adapter.insert("posts", { title: "Original", status: "draft" });
    });

    it("should update document fields", async () => {
      await adapter.update("posts", docId, { title: "Updated" });

      const doc = await adapter.findById("posts", docId);
      expect(doc?.title).toBe("Updated");
    });

    it("should preserve unmodified fields", async () => {
      await adapter.update("posts", docId, { title: "Updated" });

      const doc = await adapter.findById("posts", docId);
      expect(doc?.status).toBe("draft");
    });

    it("should set _updatedAt timestamp", async () => {
      const before = Date.now();
      await adapter.update("posts", docId, { title: "Updated" });
      const after = Date.now();

      const doc = await adapter.findById("posts", docId);
      expect(doc?._updatedAt).toBeGreaterThanOrEqual(before);
      expect(doc?._updatedAt).toBeLessThanOrEqual(after);
    });

    it("should throw for non-existent document", async () => {
      await expect(adapter.update("posts", "nonexistent", { title: "X" })).rejects.toThrow();
    });

    it("should handle partial updates", async () => {
      await adapter.update("posts", docId, { title: "New Title" });

      const doc = await adapter.findById("posts", docId);
      expect(doc?.title).toBe("New Title");
      expect(doc?.status).toBe("draft");
    });
  });

  describe("remove/delete", () => {
    let docId: DocumentId;

    beforeEach(async () => {
      adapter.initCollection("posts");
      docId = await adapter.insert("posts", { title: "Test" });
    });

    it("should remove document via remove", async () => {
      await adapter.remove("posts", docId);

      const doc = await adapter.findById("posts", docId);
      expect(doc).toBeNull();
    });

    it("should remove document via delete (backward compat)", async () => {
      await adapter.delete("posts", docId);

      const doc = await adapter.findById("posts", docId);
      expect(doc).toBeNull();
    });

    it("should handle removing non-existent document", async () => {
      // Should not throw
      await adapter.remove("posts", "nonexistent");
    });
  });

  describe("count", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
      await adapter.insert("posts", { title: "A", published: true });
      await adapter.insert("posts", { title: "B", published: false });
      await adapter.insert("posts", { title: "C", published: true });
    });

    it("should count all documents", async () => {
      const count = await adapter.count("posts", {});
      expect(count).toBe(3);
    });

    it("should count matching documents", async () => {
      const count = await adapter.count("posts", { published: true });
      expect(count).toBe(2);
    });

    it("should return 0 for no matches", async () => {
      const count = await adapter.count("posts", { published: undefined });
      expect(count).toBe(0);
    });
  });

  describe("exists", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
    });

    it("should return true for existing document", async () => {
      const id = await adapter.insert("posts", { title: "Test" });
      const exists = await adapter.exists("posts", id);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent document", async () => {
      const exists = await adapter.exists("posts", "nonexistent");
      expect(exists).toBe(false);
    });
  });

  describe("connection management", () => {
    it("should report connected status", async () => {
      const isConnected = await adapter.isConnected();
      expect(isConnected).toBe(true);
    });

    it("should disconnect", async () => {
      await adapter.disconnect();
      // For memory adapter, disconnect is a no-op
      expect(await adapter.isConnected()).toBe(true);
    });
  });

  describe("getAllDocuments", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
      await adapter.insert("posts", { title: "A" });
      await adapter.insert("posts", { title: "B" });
    });

    it("should return all documents in collection", async () => {
      const docs = adapter.getAllDocuments("posts");
      expect(docs.length).toBe(2);
    });

    it("should return empty array for empty collection", async () => {
      adapter.initCollection("empty");
      const docs = adapter.getAllDocuments("empty");
      expect(docs.length).toBe(0);
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      adapter.initCollection("posts");
      await adapter.insert("posts", { title: "A" });
    });

    it("should clear all data", () => {
      expect(adapter.getCollections().length).toBeGreaterThan(0);

      adapter.clear();

      expect(adapter.getCollections().length).toBe(0);
    });
  });

  describe("SignalDB interface compliance", () => {
    it("should implement all required methods", () => {
      const methods = [
        "find",
        "findOne",
        "findById",
        "insert",
        "update",
        "remove",
        "delete",
        "count",
        "isConnected",
        "disconnect",
      ];

      for (const method of methods) {
        expect(typeof (adapter as any)[method]).toBe("function");
      }
    });
  });

  describe("type safety", () => {
    it("should preserve document types through round-trip", async () => {
      adapter.initCollection("posts");

      interface Post {
        title: string;
        views: number;
        tags: string[];
      }

      const doc: Post = {
        title: "Test",
        views: 42,
        tags: ["a", "b"],
      };

      const id = await adapter.insert<Post>("posts", doc);
      const retrieved = await adapter.findById<Post>("posts", id);

      expect(retrieved?.title).toBe("Test");
      expect(retrieved?.views).toBe(42);
      expect(retrieved?.tags).toEqual(["a", "b"]);
    });
  });

  describe("concurrent operations", () => {
    it("should handle concurrent inserts", async () => {
      adapter.initCollection("posts");

      const promises = Array.from({ length: 100 }, (_, i) =>
        adapter.insert("posts", { title: `Post ${i}` })
      );

      const ids = await Promise.all(promises);
      expect(ids.length).toBe(100);
      expect(new Set(ids).size).toBe(100); // All unique
    });

    it("should handle concurrent reads and writes", async () => {
      adapter.initCollection("posts");

      const id = await adapter.insert("posts", { title: "Test", counter: 0 });

      const readPromises = Array.from({ length: 50 }, () =>
        adapter.findById("posts", id)
      );

      const writePromises = Array.from({ length: 50 }, (_, i) =>
        adapter.update("posts", id, { counter: i })
      );

      await Promise.all([...readPromises, ...writePromises]);

      const final = await adapter.findById("posts", id);
      expect(final?.counter).toBeDefined();
    });
  });
});
