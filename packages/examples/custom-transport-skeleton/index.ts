import { createSignalEnvelope, type SignalEnvelope } from "@signal/protocol";
import type { SignalDispatcher } from "@signal/runtime";

export interface CustomTransportEnvelope {
  envelope: SignalEnvelope;
  deliveryChannel?: string;
}

export class CustomTransportSkeleton implements SignalDispatcher {
  async dispatch(envelope: SignalEnvelope): Promise<void> {
    const outbound: CustomTransportEnvelope = {
      envelope,
      deliveryChannel: "replace-me",
    };

    console.log("dispatch envelope", JSON.stringify(outbound, null, 2));
  }

  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>
  ): () => void {
    console.log(`subscribe to ${name}`);

    void handler(
      createSignalEnvelope({
        kind: "event",
        name,
        payload: {
          note: "replace this stub with transport-specific delivery",
        },
      })
    );

    return () => {
      console.log(`unsubscribe from ${name}`);
    };
  }
}

export function createCustomTransportSkeleton() {
  return new CustomTransportSkeleton();
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
