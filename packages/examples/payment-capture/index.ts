import { createProtocolError } from "@signal/protocol";
import { defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";
import {
  createExampleRuntime,
  createReplaySafeSubscriber,
  ensureExampleSelfTraining,
  instrumentExampleEvent,
  instrumentExampleMutation,
  instrumentExampleQuery,
  instrumentExampleSubscriber,
  type ExampleStateWithSelfTraining,
} from "../support";
import {
  paymentCaptureInputSchema,
  paymentCapturedEventSchema,
  paymentStatusInputSchema,
  paymentStatusResultSchema,
} from "./schemas";

export interface PaymentRecord {
  paymentId: string;
  amount: number;
  currency: string;
  status: "authorized" | "captured";
  capturedAt: string | null;
  captureAttempts: number;
}

export interface PaymentCaptureState extends ExampleStateWithSelfTraining {
  payments: Map<string, PaymentRecord>;
  ledgerMessages: string[];
}

export function createPaymentCaptureState(): PaymentCaptureState {
  return {
    payments: new Map([
      [
        "pay_1001",
        {
          paymentId: "pay_1001",
          amount: 120,
          currency: "USD",
          status: "authorized",
          capturedAt: null,
          captureAttempts: 0,
        },
      ],
    ]),
    ledgerMessages: [],
  };
}

export function registerPaymentCapture(
  runtime = createExampleRuntime(),
  state = createPaymentCaptureState()
) {
  const selfTraining = ensureExampleSelfTraining(state, "payment-capture");

  runtime.registerQuery(
    defineQuery({
      name: "payment.status.v1",
      kind: "query",
      inputSchema: paymentStatusInputSchema,
      resultSchema: paymentStatusResultSchema,
      handler: instrumentExampleQuery(selfTraining, "payment.status.v1", (input) => {
        const payment = state.payments.get(input.paymentId);
        if (!payment) {
          throw createProtocolError("NOT_FOUND", `Unknown payment ${input.paymentId}`);
        }
        return payment;
      }),
    })
  );

  runtime.registerEvent(
    defineEvent({
      name: "payment.captured.v1",
      kind: "event",
      inputSchema: paymentCapturedEventSchema,
      resultSchema: paymentCapturedEventSchema,
      /* c8 ignore next */
      handler: instrumentExampleEvent(selfTraining, "payment.captured.v1", (payload) => payload),
    })
  );

  runtime.registerMutation(
    defineMutation({
      name: "payment.capture.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: paymentCaptureInputSchema,
      resultSchema: paymentStatusResultSchema,
      handler: instrumentExampleMutation(selfTraining, "payment.capture.v1", async (input, context) => {
        const payment = state.payments.get(input.paymentId);

        if (!payment) {
          throw createProtocolError("NOT_FOUND", `Unknown payment ${input.paymentId}`);
        }

        if (payment.amount !== input.amount || payment.currency !== input.currency) {
          throw createProtocolError("CONFLICT", "Capture payload does not match the payment");
        }

        if (payment.status === "captured") {
          return payment;
        }

        payment.status = "captured";
        payment.capturedAt = new Date().toISOString();
        payment.captureAttempts += 1;

        await context.emit("payment.captured.v1", {
          paymentId: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
          capturedAt: payment.capturedAt,
        });

        return payment;
      }),
    })
  );

  runtime.subscribe(
    "payment.captured.v1",
    createReplaySafeSubscriber(instrumentExampleSubscriber(selfTraining, "payment.captured.v1", async (event) => {
      state.ledgerMessages.push(event.messageId);
    }))
  );

  return { runtime, state };
}

export async function runPaymentCaptureDemo() {
  const { runtime, state } = registerPaymentCapture();
  const first = await runtime.mutation(
    "payment.capture.v1",
    { paymentId: "pay_1001", amount: 120, currency: "USD" },
    { idempotencyKey: "capture-pay_1001-001" }
  );
  const replay = await runtime.mutation(
    "payment.capture.v1",
    { paymentId: "pay_1001", amount: 120, currency: "USD" },
    { idempotencyKey: "capture-pay_1001-001" }
  );

  return {
    first,
    replay,
    state,
  };
}

/* c8 ignore start */
if (require.main === module) {
  runPaymentCaptureDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
