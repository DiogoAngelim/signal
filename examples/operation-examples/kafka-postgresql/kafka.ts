import { Kafka, type Consumer, type EachMessagePayload, type Producer } from "kafkajs";
import type { SignalDispatcher } from "@signal/runtime";
import type { SignalEnvelope } from "@signal/protocol";
import { paymentCapturedEventSchema, type PaymentCapturedEvent } from "./schemas";
import type { PaymentCaptureRepository } from "./repository";

type Subscriber = (envelope: SignalEnvelope) => void | Promise<void>;

export interface KafkaSignalDispatcher extends SignalDispatcher {
  close(): Promise<void>;
}

export interface CreateKafkaSignalDispatcherOptions {
  brokers: string[];
  clientId?: string;
  topic?: string;
}

export interface CreateKafkaSignalDispatcherDependencies {
  producer?: Producer;
}

export async function createKafkaSignalDispatcher(
  options: CreateKafkaSignalDispatcherOptions,
  dependencies: CreateKafkaSignalDispatcherDependencies = {}
): Promise<KafkaSignalDispatcher> {
  const kafka =
    dependencies.producer === undefined
      ? new Kafka({
          clientId: options.clientId ?? "signal-kafka-postgresql-example",
          brokers: options.brokers,
        })
      : undefined;

  const producer =
    dependencies.producer ??
    (kafka as Kafka).producer({
      allowAutoTopicCreation: true,
    });
  const subscribers = new Map<string, Set<Subscriber>>();
  const topic = options.topic ?? "signal.events";

  await producer.connect();

  return {
    async dispatch(envelope: SignalEnvelope): Promise<void> {
      await producer.send({
        topic,
        messages: [
          {
            key: envelope.name,
            value: JSON.stringify(envelope),
          },
        ],
      });

      const handlers = subscribers.get(envelope.name);
      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        await handler(envelope);
      }
    },
    subscribe(name: string, handler: Subscriber): () => void {
      const handlers = subscribers.get(name) ?? new Set<Subscriber>();
      handlers.add(handler);
      subscribers.set(name, handlers);
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      await producer.disconnect();
    },
  };
}

export interface PaymentCaptureConsumerOptions {
  brokers: string[];
  clientId?: string;
  groupId?: string;
  topic?: string;
  repository: PaymentCaptureRepository;
}

export interface PaymentCaptureConsumerDependencies {
  consumer?: Consumer;
}

export async function projectPaymentCapturedEvent(
  repository: PaymentCaptureRepository,
  envelope: SignalEnvelope
): Promise<boolean> {
  if (envelope.kind !== "event" || envelope.name !== "payment.captured.v1") {
    return false;
  }

  const payload = paymentCapturedEventSchema.parse(envelope.payload) as PaymentCapturedEvent;
  return repository.recordCaptureLog(payload, envelope.messageId);
}

export async function createPaymentCaptureConsumer(
  options: PaymentCaptureConsumerOptions,
  dependencies: PaymentCaptureConsumerDependencies = {}
) {
  const kafka =
    dependencies.consumer === undefined
      ? new Kafka({
          clientId: options.clientId ?? "signal-kafka-postgresql-example-consumer",
          brokers: options.brokers,
        })
      : undefined;

  const consumer =
    dependencies.consumer ??
    (kafka as Kafka).consumer({
      groupId: options.groupId ?? "signal-kafka-postgresql-example",
    });
  const topic = options.topic ?? "signal.events";

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  return {
    async start(): Promise<void> {
      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          if (!message.value) {
            return;
          }

          const parsed = JSON.parse(message.value.toString()) as SignalEnvelope;
          await projectPaymentCapturedEvent(options.repository, parsed);
        },
      });
    },
    async stop(): Promise<void> {
      await consumer.disconnect();
    },
  };
}
