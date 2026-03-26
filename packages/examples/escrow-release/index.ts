import { createProtocolError } from "@signal/protocol";
import { defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";
import { createExampleRuntime, createReplaySafeSubscriber } from "../support";
import {
  escrowReleaseInputSchema,
  escrowReleasedEventSchema,
  escrowStatusInputSchema,
  escrowStatusResultSchema,
} from "./schemas";

export interface EscrowRecord {
  escrowId: string;
  status: "held" | "released";
  beneficiaryId: string;
  amount: number;
  currency: string;
  releasedAt: string | null;
  releaseAttempts: number;
}

export interface EscrowReleaseState {
  escrows: Map<string, EscrowRecord>;
  releaseLog: string[];
}

export function createEscrowReleaseState(): EscrowReleaseState {
  return {
    escrows: new Map([
      [
        "esc_2001",
        {
          escrowId: "esc_2001",
          status: "held",
          beneficiaryId: "acct_beneficiary_1",
          amount: 300,
          currency: "USD",
          releasedAt: null,
          releaseAttempts: 0,
        },
      ],
    ]),
    releaseLog: [],
  };
}

export function registerEscrowRelease(
  runtime = createExampleRuntime(),
  state = createEscrowReleaseState()
) {
  runtime.registerQuery(
    defineQuery({
      name: "escrow.status.v1",
      kind: "query",
      inputSchema: escrowStatusInputSchema,
      resultSchema: escrowStatusResultSchema,
      handler: (input) => {
        const escrow = state.escrows.get(input.escrowId);
        if (!escrow) {
          throw createProtocolError("NOT_FOUND", `Unknown escrow ${input.escrowId}`);
        }
        return escrow;
      },
    })
  );

  runtime.registerEvent(
    defineEvent({
      name: "escrow.released.v1",
      kind: "event",
      inputSchema: escrowReleasedEventSchema,
      resultSchema: escrowReleasedEventSchema,
      /* c8 ignore next */
      handler: (payload) => payload,
    })
  );

  runtime.registerMutation(
    defineMutation({
      name: "escrow.release.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: escrowReleaseInputSchema,
      resultSchema: escrowStatusResultSchema,
      handler: async (input, context) => {
        const escrow = state.escrows.get(input.escrowId);
        if (!escrow) {
          throw createProtocolError("NOT_FOUND", `Unknown escrow ${input.escrowId}`);
        }

        if (escrow.status === "released") {
          return escrow;
        }

        escrow.status = "released";
        escrow.releasedAt = new Date().toISOString();
        escrow.releaseAttempts += 1;

        await context.emit("escrow.released.v1", {
          escrowId: escrow.escrowId,
          beneficiaryId: escrow.beneficiaryId,
          amount: escrow.amount,
          currency: escrow.currency,
          releasedAt: escrow.releasedAt,
        });

        return escrow;
      },
    })
  );

  runtime.subscribe(
    "escrow.released.v1",
    createReplaySafeSubscriber(async (event) => {
      state.releaseLog.push(event.messageId);
    })
  );

  return { runtime, state };
}

export async function runEscrowReleaseDemo() {
  const { runtime, state } = registerEscrowRelease();
  const first = await runtime.mutation(
    "escrow.release.v1",
    { escrowId: "esc_2001" },
    { idempotencyKey: "release-esc_2001-001" }
  );
  const replay = await runtime.mutation(
    "escrow.release.v1",
    { escrowId: "esc_2001" },
    { idempotencyKey: "release-esc_2001-001" }
  );

  return { first, replay, state };
}

/* c8 ignore start */
if (require.main === module) {
  runEscrowReleaseDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
