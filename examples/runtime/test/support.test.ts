import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPersistentExampleSelfTraining,
  ensureExampleSelfTraining,
  instrumentExampleEvent,
  instrumentExampleMutation,
  instrumentExampleQuery,
  instrumentExampleSubscriber,
} from "../support";

let trainingDir = "";

function unsetEnv(name: string): void {
  Reflect.deleteProperty(process.env, name);
}

function createTrainingPoolHarness(
  options: {
    rows?: Array<{ snapshot: unknown }>;
    failCreate?: boolean;
    failPersist?: boolean;
    persistError?: unknown;
  } = {},
) {
  const rows = [...(options.rows ?? [])];
  const persisted = new Map<string, unknown>();
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push(sql);

      if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) {
        if (options.failCreate) {
          throw new Error("create failed");
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith("SELECT snapshot FROM")) {
        return {
          rows: rows.length ? [rows.shift()] : [],
          rowCount: rows.length ? 1 : 0,
        };
      }

      if (sql.startsWith("INSERT INTO")) {
        if (options.failPersist) {
          throw options.persistError ?? "persist failed";
        }
        persisted.set(
          String(values[0]),
          JSON.parse(String(values[1])) as unknown,
        );
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  } as unknown as Pool;

  return { pool, client, persisted, queries };
}

beforeEach(() => {
  trainingDir = path.join(tmpdir(), `signal-support-${randomUUID()}`);
  process.env.SIGNAL_EXAMPLE_TRAINING_DIR = trainingDir;
});

afterEach(() => {
  unsetEnv("SIGNAL_EXAMPLE_TRAINING_DIR");
  unsetEnv("SIGNAL_EXAMPLE_TRAINING_DATABASE_URL");
  unsetEnv("SIGNAL_EXAMPLE_TRAINING_TABLE");
  unsetEnv("DATABASE_URL");
  rmSync(trainingDir, { recursive: true, force: true });
});

describe("example support self-training", () => {
  it("sanitizes file snapshots and rich values", async () => {
    mkdirSync(trainingDir, { recursive: true });
    const module = createPersistentExampleSelfTraining("   ", { trainingDir });
    expect(module.filePath).toBe(path.join(trainingDir, "example.json"));
    writeFileSync(
      module.filePath ?? "",
      JSON.stringify({ version: 1, moduleId: "other" }),
    );

    const long = "x".repeat(510);
    const codedError = Object.assign(new Error("coded"), { code: "E_CODE" });
    await module.recordQuery(
      "rich.get.v1",
      {
        long,
        nested: { a: { b: { c: { d: { e: "deep" } } } } },
        bigint: 10n,
        date: new Date("2026-05-27T00:00:00.000Z"),
        error: codedError,
        map: new Map([["a", { value: 1 }]]),
        set: new Set(["a", "b"]),
        fn: () => "value",
      },
      {
        status: "success",
        result: new Date("2026-05-27T00:00:01.000Z"),
      },
    );
    await module.recordEvent(
      "rich.event.v1",
      { ok: true },
      {
        status: "failure",
        error: "event failed",
      },
    );
    await module.recordDispatch(
      "rich.dispatch.v1",
      { ok: true },
      {
        status: "success",
      },
    );
    await module.recordSubscription(
      "rich.subscription.v1",
      { ok: true },
      {
        status: "success",
      },
    );

    const snapshot = await module.snapshot();
    const query = snapshot.parameters.operations["query:rich.get.v1"];
    const event = snapshot.parameters.operations["event:rich.event.v1"];

    expect(existsSync(module.filePath ?? "")).toBe(true);
    expect(snapshot.moduleId).toBe("   ");
    expect(query.lastInput).toMatchObject({
      long: `${"x".repeat(497)}...`,
      bigint: "10",
      date: "2026-05-27T00:00:00.000Z",
      error: {
        name: "Error",
        code: "E_CODE",
        message: "coded",
      },
      map: { a: { value: 1 } },
      set: ["a", "b"],
      fn: '() => "value"',
    });
    expect(JSON.stringify(query.lastInput)).toContain("[truncated]");
    expect(event.failures).toBe(1);
  });

  it("uses existing self-training modules and instruments failures", async () => {
    const state = {};
    const first = ensureExampleSelfTraining(state, "support-existing", {
      trainingDir,
    });
    const second = ensureExampleSelfTraining(state, "support-existing", {
      trainingDir,
    });
    const query = instrumentExampleQuery(first, "instrument.query.v1", () => {
      throw new Error("query failed");
    });
    const mutation = instrumentExampleMutation(
      first,
      "instrument.mutation.v1",
      () => "mutated",
    );
    const eventSuccess = instrumentExampleEvent(
      first,
      "instrument.event.v1",
      () => "event",
    );
    const eventFailure = instrumentExampleEvent(
      first,
      "instrument.event.v1",
      () => {
        throw new Error("event failed");
      },
    );
    const subscriberSuccess = instrumentExampleSubscriber(
      first,
      "instrument.subscriber.v1",
      () => "subscriber",
    );
    const subscriberFailure = instrumentExampleSubscriber(
      first,
      "instrument.subscriber.v1",
      () => {
        throw new Error("subscriber failed");
      },
    );

    await expect(query({ ok: true })).rejects.toThrow("query failed");
    await expect(mutation({ ok: true }, { context: true })).resolves.toBe(
      "mutated",
    );
    await expect(eventSuccess({ ok: true })).resolves.toBe("event");
    await expect(eventFailure({ ok: false })).rejects.toThrow("event failed");
    await expect(subscriberSuccess({ ok: true })).resolves.toBe("subscriber");
    await expect(subscriberFailure({ ok: false })).rejects.toThrow(
      "subscriber failed",
    );

    const snapshot = await first.snapshot();
    expect(second).toBe(first);
    expect(snapshot.totals.failures).toBeGreaterThanOrEqual(3);
  });

  it("loads and persists postgres snapshots with sanitized configuration", async () => {
    const validSnapshot = {
      version: 1,
      moduleId: "postgres-valid",
      updatedAt: new Date(0).toISOString(),
      totals: { observations: 0, successes: 0, failures: 0 },
      parameters: {
        learningRate: 0.1,
        decayRate: 0.5,
        minimumWeight: 0.1,
        maximumWeight: 4,
        operations: {},
      },
      recentObservations: [],
    };
    const valid = createTrainingPoolHarness({
      rows: [{ snapshot: JSON.stringify(validSnapshot) }],
    });
    const module = createPersistentExampleSelfTraining("postgres-valid", {
      pool: valid.pool,
      tableName: "bad-table-name",
    });

    await expect(module.snapshot()).resolves.toMatchObject({
      moduleId: "postgres-valid",
    });
    await expect(module.snapshot()).resolves.toMatchObject({
      moduleId: "postgres-valid",
    });
    await module.recordMutation(
      "postgres.save.v1",
      { ok: true },
      {
        status: "success",
        result: { ok: true },
      },
    );

    expect(module.storageKind).toBe("postgres");
    expect(module.storageKey).toBe(
      "postgres:signal_example_self_training:postgres-valid",
    );
    expect(
      valid.queries.some((query) =>
        query.includes('"signal_example_self_training"'),
      ),
    ).toBe(true);
    expect(valid.persisted.get("postgres-valid")).toBeTruthy();

    const mismatch = createTrainingPoolHarness({
      rows: [{ snapshot: { ...validSnapshot, moduleId: "other" } }],
    });
    const invalidJson = createTrainingPoolHarness({
      rows: [{ snapshot: "not-json" }],
    });

    await expect(
      createPersistentExampleSelfTraining("postgres-mismatch", {
        pool: mismatch.pool,
      }).snapshot(),
    ).resolves.toMatchObject({ totals: { observations: 0 } });
    await expect(
      createPersistentExampleSelfTraining("postgres-invalid-json", {
        pool: invalidJson.pool,
      }).snapshot(),
    ).resolves.toMatchObject({ totals: { observations: 0 } });
  });

  it("falls back across postgres configuration sources and tolerates persistence failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failingCreate = createTrainingPoolHarness({ failCreate: true });
    const failingPersist = createTrainingPoolHarness({ failPersist: true });
    const failingPersistWithError = createTrainingPoolHarness({
      failPersist: true,
      persistError: new Error("persist failed"),
    });

    await expect(
      createPersistentExampleSelfTraining("postgres-create-fails", {
        pool: failingCreate.pool,
      }).snapshot(),
    ).rejects.toThrow("create failed");

    const module = createPersistentExampleSelfTraining(
      "postgres-persist-fails",
      {
        pool: failingPersist.pool,
      },
    );
    await expect(
      module.recordQuery(
        "persist.fails.v1",
        { ok: true },
        {
          status: "success",
          result: { ok: true },
        },
      ),
    ).resolves.toBeUndefined();
    await expect(
      createPersistentExampleSelfTraining("postgres-persist-error-fails", {
        pool: failingPersistWithError.pool,
      }).recordQuery(
        "persist.error.fails.v1",
        { ok: true },
        {
          status: "success",
          result: { ok: true },
        },
      ),
    ).resolves.toBeUndefined();

    process.env.SIGNAL_EXAMPLE_TRAINING_DATABASE_URL = "postgres://training";
    const envDatabase = createPersistentExampleSelfTraining("env-db");
    unsetEnv("SIGNAL_EXAMPLE_TRAINING_DATABASE_URL");
    unsetEnv("SIGNAL_EXAMPLE_TRAINING_DIR");
    process.env.DATABASE_URL = "postgres://default";
    const defaultDatabase = createPersistentExampleSelfTraining("default-db");
    const explicitConnection = createPersistentExampleSelfTraining(
      "option-db",
      {
        connectionString: "postgres://option",
      },
    );
    const sharedConnection = createPersistentExampleSelfTraining(
      "option-db-2",
      {
        connectionString: "postgres://option",
      },
    );
    const explicitDir = createPersistentExampleSelfTraining("explicit-dir", {
      trainingDir,
    });

    expect(envDatabase.storageKind).toBe("postgres");
    expect(defaultDatabase.storageKind).toBe("postgres");
    expect(explicitConnection.storageKind).toBe("postgres");
    expect(sharedConnection.storageKind).toBe("postgres");
    expect(explicitDir.storageKind).toBe("file");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
