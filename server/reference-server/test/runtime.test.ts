import { describe, expect, it } from "vitest";
import fastify from "fastify";
import { createReferenceRuntime, createReferenceServer } from "../src/lib";
import { registerHealthRoute } from "../src/routes/health";
import { registerObservedEventsRoute } from "../src/routes/observed-events";
import * as operations from "../src/operations";
import * as routes from "../src/routes";
import * as subscribers from "../src/subscribers";

describe("reference runtime", () => {
  it("registers local reference operations and replay-safe subscribers", async () => {
    const {
      runtime,
      operations: runtimeOperations,
      subscribers: runtimeSubscribers,
    } = createReferenceRuntime();

    expect(runtimeOperations.minimal).toBeDefined();
    expect(runtimeOperations.publication).toBeDefined();
    await expect(
      runtimeOperations.publication.publishedEvent.handler(
        {
          postId: "post_handler",
          title: "Handler coverage",
          body: "Direct event definition call.",
          publishedAt: "2026-03-25T12:00:00.000Z",
        },
        {
          request: {},
          emit: async () => {
            throw new Error("not used");
          },
        },
      ),
    ).resolves.toMatchObject({ postId: "post_handler" });
    expect(runtimeSubscribers.seen).toHaveLength(0);
    expect(operations.registerReferenceOperations).toBeDefined();
    expect(routes.registerHealthRoute).toBeDefined();
    expect(subscribers.registerReferenceSubscribers).toBeDefined();

    const capabilities = runtime.capabilities();
    expect(capabilities.queries.map((entry) => entry.name)).toEqual([
      "note.get.v1",
      "post.get.v1",
      "payment.capture.get.v1",
      "reference.certification.v1",
    ]);
    expect(capabilities.mutations.map((entry) => entry.name)).toEqual([
      "post.publish.v1",
      "payment.capture.v1",
    ]);
    expect(capabilities.subscribedEvents.map((entry) => entry.name)).toEqual([
      "post.published.v1",
      "payment.captured.v1",
    ]);

    const note = await runtime.query("note.get.v1", { noteId: "note_1001" });
    expect(note.ok).toBe(true);
    expect(note.ok ? note.result.found : false).toBe(true);

    const missingNote = await runtime.query("note.get.v1", {
      noteId: "missing",
    });
    expect(missingNote.ok ? missingNote.result.note : "unexpected").toBeNull();

    const post = await runtime.query("post.get.v1", { postId: "post_1001" });
    expect(post.ok ? post.result.found : false).toBe(true);

    const missingPost = await runtime.query("post.get.v1", {
      postId: "missing",
    });
    expect(missingPost.ok ? missingPost.result.post : "unexpected").toBeNull();

    const explicitPublish = await runtime.mutation("post.publish.v1", {
      postId: "post_explicit",
      title: "Explicit publish",
      body: "Published with caller-provided identity.",
      publishedAt: "2026-03-26T12:00:00.000Z",
    });
    expect(
      explicitPublish.ok ? explicitPublish.result.post.postId : "missing",
    ).toBe("post_explicit");

    const generatedPublish = await runtime.mutation("post.publish.v1", {
      title: "Generated publish",
      body: "",
      publishedAt: "",
    });
    expect(
      generatedPublish.ok ? generatedPublish.result.post.postId : "",
    ).toMatch(/^post_/);
    expect(
      generatedPublish.ok ? generatedPublish.result.post.body : "not-empty",
    ).toBe("");

    const normalizedEvent = await runtime.publish("post.published.v1", {
      postId: "post_normalized",
      title: "Normalized event",
      body: 42,
      publishedAt: "2026-03-27T12:00:00.000Z",
    });
    expect(normalizedEvent.payload.body).toBe("");

    const event = await runtime.publish("post.published.v1", {
      postId: "post_1001",
      body: "A reference publication used by the Signal runtime smoke path.",
      title: "Protocol first",
      publishedAt: "2026-03-25T12:00:00.000Z",
    });
    const seenAfterPublish = [...runtimeSubscribers.seen];
    await runtime.dispatcher.dispatch(event);

    expect(seenAfterPublish).toContain(event.messageId);
    expect(runtimeSubscribers.seen).toEqual(seenAfterPublish);
  });

  it("returns failures for malformed local reference operation payloads", async () => {
    const { runtime } = createReferenceRuntime();

    await expect(runtime.query("note.get.v1", [])).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      runtime.query("note.get.v1", { noteId: "" }),
    ).resolves.toMatchObject({
      ok: false,
    });
    await expect(runtime.query("post.get.v1", [])).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      runtime.query("post.get.v1", { postId: "" }),
    ).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      runtime.mutation("post.publish.v1", []),
    ).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      runtime.mutation("post.publish.v1", { title: "" }),
    ).resolves.toMatchObject({
      ok: false,
    });
    await expect(runtime.publish("post.published.v1", [])).rejects.toThrow(
      /payload/,
    );
    await expect(
      runtime.publish("post.published.v1", {
        postId: "post_bad",
        title: "",
        publishedAt: "2026-03-27T12:00:00.000Z",
      }),
    ).rejects.toThrow(/title/);
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
    expect(JSON.parse(capabilities.body).bindings.http.basePath).toBe(
      "/signal",
    );
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

  it("registers the observed events route", async () => {
    const app = fastify();
    registerObservedEventsRoute(app, { seen: ["evt-1", "evt-2"] });

    const response = await app.inject({
      method: "GET",
      url: "/signal/observed-events",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      eventIds: ["evt-1", "evt-2"],
      count: 2,
    });
  });
});
