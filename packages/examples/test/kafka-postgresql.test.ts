import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createSignalEnvelope } from "@signal/protocol";
import { createMemoryIdempotencyStore } from "@signal/runtime";
import { createSignalRuntime } from "@signal/sdk-node";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKafkaPostgresExample,
  createKafkaSignalDispatcher,
  createMemoryPaymentCaptureRepository,
  createPaymentCaptureConsumer,
  createPostgresPaymentCaptureRepository,
  projectPaymentCapturedEvent,
  readKafkaBrokers,
  readKafkaPostgresExampleConfig,
  registerKafkaPostgresExample,
  runKafkaPostgresDemo,
} from "../kafka-postgresql";
import type { PaymentRecord } from "../kafka-postgresql/repository";
import { createPersistentExampleSelfTraining } from "../support";

let trainingDir = "";

function createRecordingDispatcher() {
  const subscribers = new Map<string, Set<(envelope: ReturnType<typeof createSignalEnvelope>) => void | Promise<void>>>();
  const events: Array<ReturnType<typeof createSignalEnvelope>> = [];

  return {
    events,
    async dispatch(envelope: ReturnType<typeof createSignalEnvelope>): Promise<void> {
      events.push(envelope);
      const handlers = subscribers.get(envelope.name);
      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        await handler(envelope);
      }
    },
    subscribe(
      name: string,
      handler: (envelope: ReturnType<typeof createSignalEnvelope>) => void | Promise<void>
    ) {
      const handlers = subscribers.get(name) ?? new Set();
      handlers.add(handler);
      subscribers.set(name, handlers);
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      return;
    },
  };
}

function createFakePoolHarness() {
  const payments = new Map<string, PaymentRecord>();
  const trainingSnapshots = new Map<string, Record<string, unknown>>();
  const captureLog = new Map<
    string,
    {
      message_id: string;
      payment_id: string;
      amount: number;
      currency: string;
      captured_at: Date;
    }
  >();
  const queries: string[] = [];

  const client = {
    query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push(sql);

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith("CREATE TABLE IF NOT EXISTS signal_example_payments")) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith("CREATE TABLE IF NOT EXISTS signal_example_payment_capture_log")) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith('CREATE TABLE IF NOT EXISTS "signal_example_self_training"')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith("INSERT INTO signal_example_payments")) {
        const [paymentId, amount, currency] = values;
        if (!payments.has(String(paymentId))) {
          payments.set(String(paymentId), {
            paymentId: String(paymentId),
            amount: Number(amount),
            currency: String(currency),
            status: "authorized",
            capturedAt: null,
            captureAttempts: 0,
          });
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }

      if (
        sql ===
        "SELECT payment_id, amount, currency, status, captured_at, capture_attempts FROM signal_example_payments WHERE payment_id = $1 LIMIT 1"
      ) {
        const payment = payments.get(String(values[0]));
        if (!payment) {
          return { rows: [], rowCount: 0 };
        }

        return {
          rows: [
            {
              payment_id: payment.paymentId,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              captured_at: payment.capturedAt ? new Date(payment.capturedAt) : null,
              capture_attempts: payment.captureAttempts,
            },
          ],
          rowCount: 1,
        };
      }

      if (
        sql ===
        "SELECT payment_id, amount, currency, status, captured_at, capture_attempts FROM signal_example_payments WHERE payment_id = $1 FOR UPDATE"
      ) {
        const payment = payments.get(String(values[0]));
        if (!payment) {
          return { rows: [], rowCount: 0 };
        }

        return {
          rows: [
            {
              payment_id: payment.paymentId,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              captured_at: payment.capturedAt ? new Date(payment.capturedAt) : null,
              capture_attempts: payment.captureAttempts,
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.startsWith("UPDATE signal_example_payments SET status = 'captured'")) {
        const [paymentId, capturedAt] = values;
        const current = payments.get(String(paymentId));
        if (!current) {
          return { rows: [], rowCount: 0 };
        }

        const next: PaymentRecord = {
          ...current,
          status: "captured",
          capturedAt: String(capturedAt),
          captureAttempts: current.captureAttempts + 1,
        };
        payments.set(next.paymentId, next);

        return {
          rows: [
            {
              payment_id: next.paymentId,
              amount: next.amount,
              currency: next.currency,
              status: next.status,
              captured_at: new Date(next.capturedAt),
              capture_attempts: next.captureAttempts,
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.startsWith("INSERT INTO signal_example_payment_capture_log")) {
        const [messageId, paymentId, amount, currency, capturedAt] = values;
        const key = String(messageId);
        if (captureLog.has(key)) {
          return { rows: [], rowCount: 0 };
        }

        captureLog.set(key, {
          message_id: key,
          payment_id: String(paymentId),
          amount: Number(amount),
          currency: String(currency),
          captured_at: new Date(String(capturedAt)),
        });

        return { rows: [{ message_id: key }], rowCount: 1 };
      }

      if (
        sql ===
        "SELECT message_id, payment_id, amount, currency, captured_at FROM signal_example_payment_capture_log WHERE payment_id = $1 ORDER BY created_at ASC"
      ) {
        const paymentId = String(values[0]);
        return {
          rows: [...captureLog.values()]
            .filter((entry) => entry.payment_id === paymentId)
            .map((entry) => ({ ...entry })),
          rowCount: [...captureLog.values()].filter((entry) => entry.payment_id === paymentId).length,
        };
      }

      if (
        sql ===
        'SELECT snapshot FROM "signal_example_self_training" WHERE module_id = $1 LIMIT 1'
      ) {
        const snapshot = trainingSnapshots.get(String(values[0]));
        return {
          rows: snapshot ? [{ snapshot }] : [],
          rowCount: snapshot ? 1 : 0,
        };
      }

      if (sql.startsWith('INSERT INTO "signal_example_self_training" (module_id, snapshot, updated_at)')) {
        const [moduleId, snapshot] = values;
        trainingSnapshots.set(String(moduleId), JSON.parse(String(snapshot)) as Record<string, unknown>);
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

  return { pool, client, payments, trainingSnapshots, captureLog, queries };
}

beforeEach(() => {
  trainingDir = mkdtempSync(path.join(tmpdir(), "signal-kafka-training-"));
  process.env["SIGNAL_EXAMPLE_TRAINING_DIR"] = trainingDir;
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.KAFKA_BROKERS;
  delete process.env.KAFKA_TOPIC;
  delete process.env.KAFKA_CLIENT_ID;
  delete process.env.KAFKA_GROUP_ID;
  delete process.env.SIGNAL_EXAMPLE_TRAINING_DIR;
  if (trainingDir) {
    rmSync(trainingDir, { recursive: true, force: true });
    trainingDir = "";
  }
});

describe("kafka postgres example", () => {
  it("parses kafka config from environment", () => {
    delete process.env.DATABASE_URL;
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_TOPIC;
    delete process.env.KAFKA_CLIENT_ID;
    delete process.env.KAFKA_GROUP_ID;

    expect(readKafkaBrokers()).toEqual(["localhost:9092"]);

    process.env.DATABASE_URL = "postgresql://example";
    process.env.KAFKA_BROKERS = "a:9092, b:9092";
    process.env.KAFKA_TOPIC = "signal.example.events";
    process.env.KAFKA_CLIENT_ID = "signal-client";
    process.env.KAFKA_GROUP_ID = "signal-group";

    expect(readKafkaPostgresExampleConfig()).toEqual({
      connectionString: "postgresql://example",
      brokers: ["a:9092", "b:9092"],
      topic: "signal.example.events",
      clientId: "signal-client",
      groupId: "signal-group",
    });
    expect(readKafkaBrokers("one:1, two:2")).toEqual(["one:1", "two:2"]);
    expect(readKafkaBrokers()).toEqual(["a:9092", "b:9092"]);

    delete process.env.DATABASE_URL;
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_TOPIC;
    delete process.env.KAFKA_CLIENT_ID;
    delete process.env.KAFKA_GROUP_ID;

    expect(readKafkaPostgresExampleConfig()).toEqual({
      connectionString: "postgresql://postgres:postgres@localhost:5432/signal",
      brokers: ["localhost:9092"],
      topic: "signal.events",
      clientId: undefined,
      groupId: undefined,
    });
  });

  it("runs the in-memory repository flow and tolerates duplicate capture events", async () => {
    const repository = createMemoryPaymentCaptureRepository({
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
      status: "authorized",
      capturedAt: null,
      captureAttempts: 0,
    });
    await repository.seedPayment({
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
    });

    const dispatcher = createRecordingDispatcher();
    const events: Array<ReturnType<typeof createSignalEnvelope>> = [];
    dispatcher.subscribe("payment.captured.v1", async (envelope) => {
      events.push(envelope);
    });

    const runtime = createSignalRuntime({
      idempotencyStore: createMemoryIdempotencyStore(),
      dispatcher,
      runtimeName: "kafka-postgresql-test",
    });

    registerKafkaPostgresExample(runtime, repository);

    const first = await runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_9001", amount: 120, currency: "USD" },
      { idempotencyKey: "capture-pay_9001-001" }
    );
    const replay = await runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_9001", amount: 120, currency: "USD" },
      { idempotencyKey: "capture-pay_9001-001" }
    );

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(await repository.ensureSchema()).toBeUndefined();
    expect(await projectPaymentCapturedEvent(repository, events[0])).toBe(true);
    expect(await projectPaymentCapturedEvent(repository, events[0])).toBe(false);

    const status = await runtime.query("payment.status.v1", { paymentId: "pay_9001" });
    const captureLog = await runtime.query("payment.capture-log.v1", {
      paymentId: "pay_9001",
    });

    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.result.captureAttempts).toBe(1);
      expect(status.result.status).toBe("captured");
    }
    expect(captureLog.ok).toBe(true);
    if (captureLog.ok) {
      expect(captureLog.result.events).toHaveLength(1);
    }
  });

  it("covers the postgres repository contract with a fake pool", async () => {
    const harness = createFakePoolHarness();
    const repository = createPostgresPaymentCaptureRepository(harness.pool);

    await repository.ensureSchema();
    await repository.seedPayment({ paymentId: "pay_9001", amount: 120, currency: "USD" });
    await repository.seedPayment({ paymentId: "pay_9001", amount: 999, currency: "EUR" });

    expect(await repository.getPayment("missing")).toBeNull();

    const payment = await repository.getPayment("pay_9001");
    expect(payment).toMatchObject({
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
      status: "authorized",
      captureAttempts: 0,
    });

    await expect(
      repository.capturePayment({
        paymentId: "missing",
        amount: 120,
        currency: "USD",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      repository.capturePayment({
        paymentId: "pay_9001",
        amount: 999,
        currency: "USD",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const captured = await repository.capturePayment({
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
    });
    const replay = await repository.capturePayment({
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
    });

    expect(captured.status).toBe("captured");
    expect(captured.captureAttempts).toBe(1);
    expect(replay.captureAttempts).toBe(1);

    const event = {
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
      capturedAt: captured.capturedAt ?? new Date().toISOString(),
    };

    expect(await repository.recordCaptureLog(event, "message-1")).toBe(true);
    expect(await repository.recordCaptureLog(event, "message-1")).toBe(false);

    const log = await repository.listCaptureLog("pay_9001");
    expect(log.events).toHaveLength(1);
    expect(log.events[0]).toMatchObject({
      messageId: "message-1",
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
    });
    expect(harness.client.query).toHaveBeenCalled();
    expect(harness.queries.some((query) => query.startsWith("CREATE TABLE IF NOT EXISTS signal_example_payments"))).toBe(true);
  });

  it("persists self-training snapshots through postgres", async () => {
    const harness = createFakePoolHarness();
    const selfTraining = createPersistentExampleSelfTraining("postgres-self-training", {
      pool: harness.pool,
    });

    await selfTraining.recordQuery("payment.status.v1", { paymentId: "pay_9001" }, {
      status: "success",
      result: { paymentId: "pay_9001", status: "captured" },
    });
    await selfTraining.recordMutation("payment.capture.v1", { paymentId: "pay_9001" }, {
      status: "failure",
      error: new Error("duplicate capture"),
    });

    const nextInstance = createPersistentExampleSelfTraining("postgres-self-training", {
      pool: harness.pool,
    });
    const snapshot = await nextInstance.snapshot();

    expect(nextInstance.storageKind).toBe("postgres");
    expect(snapshot.totals.observations).toBe(2);
    expect(snapshot.parameters.operations["query:payment.status.v1"]?.successes).toBe(1);
    expect(snapshot.parameters.operations["mutation:payment.capture.v1"]?.failures).toBe(1);
    expect(harness.trainingSnapshots.get("postgres-self-training")).toBeTruthy();
  });

  it("dispatches event envelopes through kafka helpers and starts a replay-safe consumer", async () => {
    const sent: Array<{ topic: string; message: string }> = [];
    const producer = {
      connect: vi.fn(async () => undefined),
      send: vi.fn(async ({ topic, messages }: { topic: string; messages: Array<{ value?: string }> }) => {
        sent.push({ topic, message: String(messages[0]?.value ?? "") });
      }),
      disconnect: vi.fn(async () => undefined),
    };

    const dispatcher = await createKafkaSignalDispatcher(
      { brokers: ["localhost:9092"], topic: "signal.example.events" },
      { producer: producer as never }
    );

    const dispatchEvents: Array<ReturnType<typeof createSignalEnvelope>> = [];
    const unsubscribe = dispatcher.subscribe("payment.captured.v1", async (envelope) => {
      dispatchEvents.push(envelope);
    });

    const envelope = createSignalEnvelope({
      kind: "event",
      name: "payment.captured.v1",
      payload: {
        paymentId: "pay_9001",
        amount: 120,
        currency: "USD",
        capturedAt: new Date().toISOString(),
      },
      source: {
        system: "test",
        transport: "kafka",
      },
    });

    await dispatcher.dispatch(
      createSignalEnvelope({
        kind: "event",
        name: "payment.untracked.v1",
        payload: {
          paymentId: "pay_9001",
          amount: 120,
          currency: "USD",
          capturedAt: new Date().toISOString(),
        },
      })
    );
    await dispatcher.dispatch(envelope);
    unsubscribe();
    await dispatcher.dispatch(envelope);
    await dispatcher.close();

    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledTimes(3);
    expect(sent[0]).toMatchObject({ topic: "signal.example.events" });
    expect(dispatchEvents).toHaveLength(1);
    expect(producer.disconnect).toHaveBeenCalledTimes(1);

    const repository = createMemoryPaymentCaptureRepository();
    const invalidKind = await projectPaymentCapturedEvent(
      repository,
      createSignalEnvelope({
        kind: "query",
        name: "payment.status.v1",
        payload: { paymentId: "pay_9001" },
      })
    );
    const wrongName = await projectPaymentCapturedEvent(
      repository,
      createSignalEnvelope({
        kind: "event",
        name: "payment.other.v1",
        payload: {
          paymentId: "pay_9001",
          amount: 120,
          currency: "USD",
          capturedAt: new Date().toISOString(),
        },
      })
    );
    const valid = await projectPaymentCapturedEvent(repository, envelope);
    const duplicate = await projectPaymentCapturedEvent(repository, envelope);

    expect(invalidKind).toBe(false);
    expect(wrongName).toBe(false);
    expect(valid).toBe(true);
    expect(duplicate).toBe(false);

    const fakeConsumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      run: vi.fn(async ({ eachMessage }: { eachMessage: (input: { message: { value?: Buffer } }) => Promise<void> }) => {
        await eachMessage({ message: { value: undefined } });
        await eachMessage({ message: { value: Buffer.from(JSON.stringify(envelope)) } });
      }),
      disconnect: vi.fn(async () => undefined),
    };

    const consumer = await createPaymentCaptureConsumer(
      {
        brokers: ["localhost:9092"],
        topic: "signal.example.events",
        repository,
      },
      { consumer: fakeConsumer as never }
    );

    await consumer.start();
    await consumer.stop();

    expect(fakeConsumer.connect).toHaveBeenCalledTimes(1);
    expect(fakeConsumer.subscribe).toHaveBeenCalledWith({
      topic: "signal.example.events",
      fromBeginning: true,
    });
    expect(fakeConsumer.run).toHaveBeenCalledTimes(1);
    expect(fakeConsumer.disconnect).toHaveBeenCalledTimes(1);
    expect((await repository.listCaptureLog("pay_9001")).events).toHaveLength(1);
  });

  it("creates and runs the example with injected dependencies", async () => {
    const harness = createFakePoolHarness();
    const dispatcher = createRecordingDispatcher();
    const consumer = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };

    const example = await createKafkaPostgresExample(
      {
        connectionString: "postgresql://example",
        brokers: ["localhost:9092"],
        topic: "signal.example.events",
      },
      {
        pool: harness.pool,
        dispatcher: dispatcher as never,
        consumer: consumer as never,
      }
    );

    expect(dispatcher.events).toHaveLength(0);
    expect(consumer.start).not.toHaveBeenCalled();
    expect(
      harness.queries.some((query) =>
        query.startsWith("CREATE TABLE IF NOT EXISTS signal_example_payments")
      )
    ).toBe(true);
    await example.close();
    expect(consumer.stop).not.toHaveBeenCalled();
    expect(harness.pool.end).toHaveBeenCalledTimes(1);
  });

  it("runs the end-to-end demo with injected collaborators", async () => {
    const repository = createMemoryPaymentCaptureRepository();
    const dispatcher = createRecordingDispatcher();
    const consumer = {
      start: vi.fn(async () => {
        dispatcher.subscribe("payment.captured.v1", async (envelope) => {
          await projectPaymentCapturedEvent(repository, envelope);
        });
      }),
      stop: vi.fn(async () => undefined),
    };

    const output = await runKafkaPostgresDemo(
      {
        connectionString: "postgresql://example",
        brokers: ["localhost:9092"],
        topic: "signal.example.events",
      },
      {
        repository,
        dispatcher: dispatcher as never,
        consumer: consumer as never,
        idempotencyStore: createMemoryIdempotencyStore(),
      }
    );

    expect(output.first.ok).toBe(true);
    expect(output.replay.ok).toBe(true);
    expect(output.status.ok).toBe(true);
    expect(output.captureLog.ok).toBe(true);
    if (output.captureLog.ok) {
      expect(output.captureLog.result.events).toHaveLength(1);
    }
    expect(consumer.start).toHaveBeenCalledTimes(1);
  });
});
