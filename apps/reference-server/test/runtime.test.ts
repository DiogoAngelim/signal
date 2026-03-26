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

    expect(runtimeOperations.minimal).toBeDefined();
    expect(runtimeOperations.publication).toBeDefined();
    expect(runtimeSubscribers.seen).toHaveLength(0);
    expect(operations.registerReferenceOperations).toBeDefined();
    expect(routes.registerHealthRoute).toBeDefined();
    expect(subscribers.registerReferenceSubscribers).toBeDefined();

    const capabilities = runtime.capabilities();
    expect(capabilities.queries.map((entry) => entry.name)).toEqual([
      "note.get.v1",
      "post.get.v1",
    ]);
    expect(capabilities.mutations.map((entry) => entry.name)).toEqual([
      "post.publish.v1",
    ]);
    expect(capabilities.subscribedEvents.map((entry) => entry.name)).toEqual([
      "post.published.v1",
    ]);

    const event = await runtime.publish("post.published.v1", {
      postId: "post_1001",
      title: "Protocol first",
      publishedAt: "2026-03-25T12:00:00.000Z",
    });
    await runtime.dispatcher.dispatch(event);

    expect(runtimeSubscribers.seen).toEqual([event.messageId]);
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
