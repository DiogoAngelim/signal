import { describe, expect, it } from "vitest";
import fastify from "fastify";
import { createReferenceRuntime, createReferenceServer } from "../src/lib";
import { registerHealthRoute } from "../src/routes/health";
import * as operations from "../src/operations";
import * as routes from "../src/routes";
import * as subscribers from "../src/subscribers";

describe("reference runtime", () => {
  it("registers the example operations and replay-safe subscribers", async () => {
    const {
      runtime,
      operations: runtimeOperations,
      subscribers: runtimeSubscribers,
    } = createReferenceRuntime();

    expect(runtimeOperations.payment).toBeDefined();
    expect(runtimeOperations.escrow).toBeDefined();
    expect(runtimeOperations.user).toBeDefined();
    expect(runtimeSubscribers.seen).toHaveLength(0);
    expect(operations.registerReferenceOperations).toBeDefined();
    expect(routes.registerHealthRoute).toBeDefined();
    expect(subscribers.registerReferenceSubscribers).toBeDefined();

    const capabilities = runtime.capabilities();
    expect(capabilities.queries.map((entry) => entry.name)).toEqual([
      "payment.status.v1",
      "escrow.status.v1",
      "user.profile.v1",
    ]);
    expect(capabilities.mutations.map((entry) => entry.name)).toEqual([
      "payment.capture.v1",
      "escrow.release.v1",
      "user.onboard.v1",
    ]);
    expect(capabilities.subscribedEvents.map((entry) => entry.name)).toEqual([
      "payment.captured.v1",
      "escrow.released.v1",
      "user.onboarded.v1",
    ]);

    const event = await runtime.publish("payment.captured.v1", {
      paymentId: "pay_1001",
      amount: 120,
      currency: "USD",
      capturedAt: "2026-03-25T12:00:00.000Z",
    });

    await runtime.dispatcher.dispatch(event);
    const escrowEvent = await runtime.publish("escrow.released.v1", {
      escrowId: "esc_2001",
      beneficiaryId: "acct_beneficiary_1",
      amount: 300,
      currency: "USD",
      releasedAt: "2026-03-25T12:00:00.000Z",
    });
    await runtime.dispatcher.dispatch(escrowEvent);
    const userEvent = await runtime.publish("user.onboarded.v1", {
      userId: "user_3001",
      email: "ada@example.com",
      plan: "pro",
      onboardedAt: "2026-03-25T12:00:00.000Z",
    });
    await runtime.dispatcher.dispatch(userEvent);

    expect(runtimeSubscribers.seen).toEqual([
      event.messageId,
      escrowEvent.messageId,
      userEvent.messageId,
    ]);
  });

  it("creates a fastify server with the signal binding", async () => {
    const { runtime } = createReferenceRuntime();
    const app = createReferenceServer(runtime);

    const health = await app.inject({
      method: "GET",
      url: "/health",
    });

    const capabilities = await app.inject({
      method: "GET",
      url: "/signal/capabilities",
    });

    expect(health.statusCode).toBe(200);
    expect(capabilities.statusCode).toBe(200);
    expect(JSON.parse(capabilities.body).bindings.http.basePath).toBe("/signal");
  });

  it("registers the explicit health route", async () => {
    const app = fastify();
    registerHealthRoute(app);

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).service).toBe("signal-reference-server");
  });
});
