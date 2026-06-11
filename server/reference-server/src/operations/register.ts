import type { SignalRuntime, SignalSchema } from "@signal/sdk-node";
import {
  type HighRiskPaymentStore,
  createHighRiskPaymentStore,
  registerHighRiskPaymentFlow,
} from "./high-risk-payment";

type Note = {
  noteId: string;
  title: string;
  body: string;
  updatedAt: string;
};

type Post = {
  postId: string;
  title: string;
  body: string;
  publishedAt: string;
};

type NoteGetInput = {
  noteId: string;
};

type NoteGetResult = {
  found: boolean;
  note: Note | null;
};

type PostGetInput = {
  postId: string;
};

type PostGetResult = {
  found: boolean;
  post: Post | null;
};

type PostPublishInput = {
  postId?: string;
  title: string;
  body: string;
  publishedAt?: string;
};

type PostPublishResult = {
  post: Post;
  event: "post.published.v1";
};

const notes = new Map<string, Note>([
  [
    "note_1001",
    {
      noteId: "note_1001",
      title: "Protocol first",
      body: "Signal routes every query, mutation, and event through explicit runtime contracts.",
      updatedAt: "2026-03-25T12:00:00.000Z",
    },
  ],
]);

const posts = new Map<string, Post>([
  [
    "post_1001",
    {
      postId: "post_1001",
      title: "Protocol first",
      body: "A reference publication used by the Signal runtime smoke path.",
      publishedAt: "2026-03-25T12:00:00.000Z",
    },
  ],
]);

function schema<T>(parse: (value: unknown) => T): SignalSchema<T> {
  return { parse } as SignalSchema<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${field} is required`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const noteGetInputSchema = schema<NoteGetInput>((value) => {
  if (!isRecord(value)) throw new Error("note.get.v1 input must be an object");
  return { noteId: requireString(value.noteId, "noteId") };
});

const postGetInputSchema = schema<PostGetInput>((value) => {
  if (!isRecord(value)) throw new Error("post.get.v1 input must be an object");
  return { postId: requireString(value.postId, "postId") };
});

const postPublishInputSchema = schema<PostPublishInput>((value) => {
  if (!isRecord(value))
    throw new Error("post.publish.v1 input must be an object");
  return {
    ...(optionalString(value.postId)
      ? { postId: optionalString(value.postId) }
      : {}),
    title: requireString(value.title, "title"),
    body: optionalString(value.body) ?? "",
    ...(optionalString(value.publishedAt)
      ? { publishedAt: optionalString(value.publishedAt) }
      : {}),
  };
});

const postEventSchema = schema<Post>((value) => {
  if (!isRecord(value))
    throw new Error("post.published.v1 payload must be an object");
  return {
    postId: requireString(value.postId, "postId"),
    title: requireString(value.title, "title"),
    body: typeof value.body === "string" ? value.body : "",
    publishedAt: requireString(value.publishedAt, "publishedAt"),
  };
});

const noteGetResultSchema = schema<NoteGetResult>(
  (value) => value as NoteGetResult,
);
const postGetResultSchema = schema<PostGetResult>(
  (value) => value as PostGetResult,
);
const postPublishResultSchema = schema<PostPublishResult>(
  (value) => value as PostPublishResult,
);

export function registerReferenceOperations(
  runtime: SignalRuntime,
  highRiskPaymentStore: HighRiskPaymentStore = createHighRiskPaymentStore(),
) {
  const noteQuery = runtime.registerQuery({
    name: "note.get.v1",
    kind: "query",
    inputSchema: noteGetInputSchema,
    resultSchema: noteGetResultSchema,
    async handler(input) {
      const note = notes.get(input.noteId) ?? null;
      return { found: Boolean(note), note };
    },
  });

  const postQuery = runtime.registerQuery({
    name: "post.get.v1",
    kind: "query",
    inputSchema: postGetInputSchema,
    resultSchema: postGetResultSchema,
    async handler(input) {
      const post = posts.get(input.postId) ?? null;
      return { found: Boolean(post), post };
    },
  });

  const publishedEvent = runtime.registerEvent({
    name: "post.published.v1",
    kind: "event",
    inputSchema: postEventSchema,
    resultSchema: postEventSchema,
    async handler(input) {
      return input;
    },
  });

  const publishMutation = runtime.registerMutation({
    name: "post.publish.v1",
    kind: "mutation",
    idempotency: "optional",
    inputSchema: postPublishInputSchema,
    resultSchema: postPublishResultSchema,
    emits: ["post.published.v1"],
    normalizeIdempotencyInput(input) {
      return {
        postId: input.postId,
        title: input.title,
      };
    },
    async handler(input, context) {
      const post = {
        postId: input.postId ?? `post_${posts.size + 1001}`,
        title: input.title,
        body: input.body,
        publishedAt: input.publishedAt ?? new Date().toISOString(),
      };
      posts.set(post.postId, post);
      await context.emit("post.published.v1", post);
      return { post, event: "post.published.v1" as const };
    },
  });

  const highRiskPayment = registerHighRiskPaymentFlow(
    runtime,
    highRiskPaymentStore,
  );

  return {
    minimal: { noteQuery },
    publication: { postQuery, publishMutation, publishedEvent },
    highRiskPayment,
  };
}
