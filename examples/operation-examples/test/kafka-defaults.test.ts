import { createSignalEnvelope } from "@signal/protocol";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const producer = {
    connect: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
  const consumer = {
    connect: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => undefined),
    run: vi.fn(
      async ({
        eachMessage,
      }: {
        eachMessage: (input: { message: { value?: Buffer } }) => Promise<void>;
      }) => {
        await eachMessage({ message: { value: undefined } });
      },
    ),
    disconnect: vi.fn(async () => undefined),
  };
  const poolClient = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => poolClient),
    end: vi.fn(async () => undefined),
  };

  return {
    producer,
    consumer,
    pool,
    poolClient,
    kafkaConfigs: [] as unknown[],
    poolConfigs: [] as unknown[],
    Kafka: vi.fn(function Kafka(config: unknown) {
      mocks.kafkaConfigs.push(config);
      return {
        producer: vi.fn(() => producer),
        consumer: vi.fn(() => consumer),
      };
    }),
    Pool: vi.fn(function Pool(config: unknown) {
      mocks.poolConfigs.push(config);
      return pool;
    }),
    createPostgresIdempotencyStore: vi.fn(() => ({
      reserve: vi.fn(async () => ({ state: "reserved" as const })),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    })),
  };
});

vi.mock("kafkajs", () => ({
  Kafka: mocks.Kafka,
}));

vi.mock("pg", () => ({
  Pool: mocks.Pool,
}));

vi.mock("@signal/idempotency-postgres", () => ({
  createPostgresIdempotencyStore: mocks.createPostgresIdempotencyStore,
}));

import {
  createKafkaPostgresExample,
  createKafkaSignalDispatcher,
  createMemoryPaymentCaptureRepository,
  createPaymentCaptureConsumer,
} from "../kafka-postgresql";

describe("kafka postgres default collaborators", () => {
  it("constructs default kafka, postgres, dispatcher, and consumer dependencies", async () => {
    const dispatcher = await createKafkaSignalDispatcher({
      brokers: ["localhost:9092"],
    });
    await dispatcher.dispatch(
      createSignalEnvelope({
        kind: "event",
        name: "unobserved.event.v1",
        payload: {},
      }),
    );
    await dispatcher.close();

    const repository = createMemoryPaymentCaptureRepository();
    const consumer = await createPaymentCaptureConsumer({
      brokers: ["localhost:9092"],
      repository,
    });
    await consumer.start();
    await consumer.stop();

    const example = await createKafkaPostgresExample({
      connectionString: "postgres://example",
      brokers: ["localhost:9092"],
    });
    await example.close();

    expect(mocks.Kafka).toHaveBeenCalled();
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
    expect(mocks.createPostgresIdempotencyStore).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
    expect(mocks.producer.connect).toHaveBeenCalled();
    expect(mocks.producer.send).toHaveBeenCalled();
    expect(mocks.producer.disconnect).toHaveBeenCalled();
    expect(mocks.consumer.connect).toHaveBeenCalled();
    expect(mocks.consumer.subscribe).toHaveBeenCalledWith({
      topic: "signal.events",
      fromBeginning: true,
    });
    expect(mocks.consumer.run).toHaveBeenCalled();
    expect(mocks.consumer.disconnect).toHaveBeenCalled();
    expect(mocks.pool.end).toHaveBeenCalled();
  });
});
