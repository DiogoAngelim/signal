import { createSignalEnvelope, type SignalEnvelope } from "@signal/protocol";
import type { SignalDispatcher } from "@signal/runtime";
import {
  createPersistentExampleSelfTraining,
  type ExampleSelfTrainingModule,
} from "../support";

export interface CustomTransportEnvelope {
  envelope: SignalEnvelope;
  deliveryChannel?: string;
}

export class CustomTransportSkeleton implements SignalDispatcher {
  constructor(
    readonly selfTraining: ExampleSelfTrainingModule = createPersistentExampleSelfTraining(
      "custom-transport-skeleton"
    )
  ) {}

  async dispatch(envelope: SignalEnvelope): Promise<void> {
    try {
      const outbound: CustomTransportEnvelope = {
        envelope,
        deliveryChannel: "replace-me",
      };

      console.log("dispatch envelope", JSON.stringify(outbound, null, 2));
      await this.selfTraining.recordDispatch(envelope.name, envelope, {
        status: "success",
        result: outbound,
      });
    } catch (error) {
      await this.selfTraining.recordDispatch(envelope.name, envelope, {
        status: "failure",
        error,
      });
      throw error;
    }
  }

  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>
  ): () => void {
    console.log(`subscribe to ${name}`);

    const envelope = createSignalEnvelope({
      kind: "event",
      name,
      payload: {
        note: "replace this stub with transport-specific delivery",
      },
    });

    void this.selfTraining.recordSubscription(name, envelope, {
      status: "success",
      result: { subscribed: true },
    });

    void Promise.resolve(handler(envelope))
      .then(() => {
        return this.selfTraining.recordSubscriber(name, envelope, {
          status: "success",
        });
      })
      .catch((error) => {
        return this.selfTraining.recordSubscriber(name, envelope, {
          status: "failure",
          error,
        });
      });

    return () => {
      console.log(`unsubscribe from ${name}`);
    };
  }
}

export function createCustomTransportSkeleton(
  selfTraining?: ExampleSelfTrainingModule
) {
  return new CustomTransportSkeleton(selfTraining);
}

/* c8 ignore start */
if (require.main === module) {
  const dispatcher = createCustomTransportSkeleton();

  dispatcher
    .dispatch(
      createSignalEnvelope({
        kind: "event",
        name: "transport.sample.v1",
        payload: {
          note: "replace this with broker-backed delivery",
        },
        delivery: {
          mode: "at-least-once",
          attempt: 1,
        },
      })
    )
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
/* c8 ignore end */
