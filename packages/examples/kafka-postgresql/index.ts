import { createProtocolError } from "@signal/protocol";
import { Pool } from "pg";
import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import { createSignalRuntime, defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";
import type { SignalIdempotencyStore, SignalRuntime } from "@signal/runtime";
import {
  createKafkaSignalDispatcher,
  createPaymentCaptureConsumer,
  projectPaymentCapturedEvent,
  type KafkaSignalDispatcher,
} from "./kafka";
import {
  createMemoryPaymentCaptureRepository,
  createPostgresPaymentCaptureRepository,
  type PaymentCaptureRepository,
  type PaymentRecord,
} from "./repository";
import {
  paymentCaptureInputSchema,
  paymentCaptureLogInputSchema,
  paymentCaptureLogResultSchema,
  paymentCapturedEventSchema,
  paymentStatusInputSchema,
  paymentStatusResultSchema,
} from "./schemas";

export interface KafkaPostgresExampleConfig {
  connectionString: string;
  brokers: string[];
  topic?: string;
  clientId?: string;
  groupId?: string;
}

export interface KafkaPostgresExample {
  runtime: SignalRuntime;
  repository: PaymentCaptureRepository;
  dispatcher: KafkaSignalDispatcher;
  consumer: Awaited<ReturnType<typeof createPaymentCaptureConsumer>>;
  pool?: Pool;
  close(): Promise<void>;
}

export interface KafkaPostgresExampleDependencies {
  pool?: Pool;
  repository?: PaymentCaptureRepository;
  dispatcher?: KafkaSignalDispatcher;
  consumer?: Awaited<ReturnType<typeof createPaymentCaptureConsumer>>;
  idempotencyStore?: SignalIdempotencyStore;
}

export function readKafkaBrokers(value = process.env["KAFKA_BROKERS"]): string[] {
  return (value ?? "localhost:9092")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function readKafkaPostgresExampleConfig(): KafkaPostgresExampleConfig {
  return {
    connectionString:
      process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/signal",
    brokers: readKafkaBrokers(),
    topic: process.env["KAFKA_TOPIC"] ?? "signal.events",
    clientId: process.env["KAFKA_CLIENT_ID"],
    groupId: process.env["KAFKA_GROUP_ID"],
  };
}

export function registerKafkaPostgresExample(
  runtime: SignalRuntime,
  repository: PaymentCaptureRepository
) {
  runtime.registerQuery(
    defineQuery({
      name: "payment.status.v1",
      kind: "query",
      inputSchema: paymentStatusInputSchema,
      resultSchema: paymentStatusResultSchema,
      handler: async (input) => {
        const payment = await repository.getPayment(input.paymentId);
        if (!payment) {
          throw createProtocolError("NOT_FOUND", `Unknown payment ${input.paymentId}`);
        }
        return payment;
      },
    })
  );

  runtime.registerQuery(
    defineQuery({
      name: "payment.capture-log.v1",
      kind: "query",
      inputSchema: paymentCaptureLogInputSchema,
      resultSchema: paymentCaptureLogResultSchema,
      handler: async (input) => repository.listCaptureLog(input.paymentId),
    })
  );

  runtime.registerEvent(
    defineEvent({
      name: "payment.captured.v1",
      kind: "event",
      inputSchema: paymentCapturedEventSchema,
      resultSchema: paymentCapturedEventSchema,
      handler: (payload) => payload,
    })
  );

  runtime.registerMutation(
    defineMutation({
      name: "payment.capture.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: paymentCaptureInputSchema,
      resultSchema: paymentStatusResultSchema,
      handler: async (input, context) => {
        const captured = await repository.capturePayment(input);

        await context.emit("payment.captured.v1", {
          paymentId: captured.paymentId,
          amount: captured.amount,
          currency: captured.currency,
          capturedAt: captured.capturedAt ?? new Date().toISOString(),
        });

        return captured;
      },
    })
  );

  return runtime;
}

export async function createKafkaPostgresExample(
  config = readKafkaPostgresExampleConfig(),
  dependencies: KafkaPostgresExampleDependencies = {}
): Promise<KafkaPostgresExample> {
  const pool =
    dependencies.pool ??
    (dependencies.repository
      ? undefined
      : new Pool({
          connectionString: config.connectionString,
        }));
  const postgresRepository =
    dependencies.repository ?? createPostgresPaymentCaptureRepository(pool as Pool);
  const dispatcher =
    dependencies.dispatcher ??
    (await createKafkaSignalDispatcher({
      brokers: config.brokers,
      clientId: config.clientId,
      topic: config.topic,
    }));

  const runtime = createSignalRuntime({
    idempotencyStore:
      dependencies.idempotencyStore ??
      createPostgresIdempotencyStore({
        connectionString: config.connectionString,
      }),
    dispatcher,
    runtimeName: "signal-kafka-postgresql-example",
  });

  registerKafkaPostgresExample(runtime, postgresRepository);
  runtime.lock();

  await postgresRepository.ensureSchema();

  const consumer =
    dependencies.consumer ??
    (await createPaymentCaptureConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topic: config.topic,
      repository: postgresRepository,
    }));

  return {
    runtime,
    repository: postgresRepository,
    dispatcher,
    consumer,
    pool,
    async close(): Promise<void> {
      if (dependencies.consumer === undefined) {
        await consumer.stop();
      }
      if (dependencies.dispatcher === undefined) {
        await dispatcher.close();
      }
      if (pool) {
        await pool.end();
      }
    },
  };
}

export async function runKafkaPostgresDemo(
  config = readKafkaPostgresExampleConfig(),
  dependencies: KafkaPostgresExampleDependencies = {}
) {
  const example = await createKafkaPostgresExample(config, dependencies);

  try {
    const seed: PaymentRecord = {
      paymentId: "pay_9001",
      amount: 120,
      currency: "USD",
      status: "authorized",
      capturedAt: null,
      captureAttempts: 0,
    };

    await example.repository.seedPayment(seed);

    await example.consumer.start();

    const first = await example.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_9001", amount: 120, currency: "USD" },
      { idempotencyKey: "capture-pay_9001-001" }
    );

    const replay = await example.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_9001", amount: 120, currency: "USD" },
      { idempotencyKey: "capture-pay_9001-001" }
    );

    const status = await example.runtime.query("payment.status.v1", {
      paymentId: "pay_9001",
    });

    const captureLog = await example.runtime.query("payment.capture-log.v1", {
      paymentId: "pay_9001",
    });

    return { first, replay, status, captureLog };
  } finally {
    await example.close();
  }
}

/* c8 ignore start */
if (require.main === module) {
  runKafkaPostgresDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */

export {
  createMemoryPaymentCaptureRepository,
  createPostgresPaymentCaptureRepository,
  projectPaymentCapturedEvent,
  createKafkaSignalDispatcher,
  createPaymentCaptureConsumer,
};
