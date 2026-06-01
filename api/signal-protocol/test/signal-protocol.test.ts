import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  clientAssetsAvailable,
  createSignalApiRouter,
  createSignalServer,
  getSignalResults,
  resolveClientDir,
} from "../src";

async function withServer<T>(
  app: ReturnType<typeof express>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral HTTP port");
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("signal-protocol package", () => {
  const clientDir = resolveClientDir();

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true });
  });

  it("serves API health, validation, signal processing, and bounded results", async () => {
    const app = express();
    app.use(express.json());
    app.use(createSignalApiRouter());

    await withServer(app, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/healthz`);
      const missing = await fetch(`${baseUrl}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: " " }),
      });
      const missingNonString = await fetch(`${baseUrl}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const processed = await fetch(`${baseUrl}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "hello",
          operation: " ",
        }),
      });
      const processedWithNonStringOperation = await fetch(`${baseUrl}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "non-string operation",
          operation: 42,
        }),
      });
      const emitted = await fetch(`${baseUrl}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "emit me",
          operation: "emit",
          data: { value: 1 },
        }),
      });

      for (let index = 0; index < 51; index += 1) {
        await fetch(`${baseUrl}/signal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: `message-${index}`,
            operation: `operation-${index}`,
          }),
        });
      }

      const results = await fetch(`${baseUrl}/signal/results`);

      expect(await health.json()).toEqual({ status: "ok" });
      expect(missing.status).toBe(400);
      expect(await missing.json()).toEqual({ message: "message is required." });
      expect(missingNonString.status).toBe(400);
      expect(await missingNonString.json()).toEqual({
        message: "message is required.",
      });
      expect(await processed.json()).toMatchObject({
        status: "success",
        message: "Signal processed successfully.",
        result: {
          operation: "default",
          received: {
            message: "hello",
            data: null,
          },
        },
      });
      expect(await processedWithNonStringOperation.json()).toMatchObject({
        status: "success",
        result: {
          operation: "default",
        },
      });
      expect(await emitted.json()).toMatchObject({
        status: "processing",
        message: "Signal queued for emission.",
        result: {
          operation: "emit",
          received: {
            message: "emit me",
            data: { value: 1 },
          },
        },
      });
      expect(await results.json()).toHaveLength(50);
      expect(getSignalResults()).toHaveLength(50);
      expect(getSignalResults()).not.toBe(getSignalResults());
    });
  });

  it("detects client assets and serves configured API paths without client files", async () => {
    expect(clientAssetsAvailable()).toBe(false);

    const app = createSignalServer({ basePath: "/custom", serveClient: false });
    await withServer(app, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/custom/healthz`);
      const missingDefaultPath = await fetch(`${baseUrl}/api/healthz`);

      expect(await health.json()).toEqual({ status: "ok" });
      expect(missingDefaultPath.status).toBe(404);
    });
  });

  it("serves client assets when they are present", async () => {
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(path.join(clientDir, "index.html"), "<h1>Signal</h1>");

    expect(clientAssetsAvailable()).toBe(true);

    const app = createSignalServer();
    await withServer(app, async (baseUrl) => {
      const index = await fetch(`${baseUrl}/dashboard`);
      const apiMiss = await fetch(`${baseUrl}/api/missing`);

      expect(index.status).toBe(200);
      expect(await index.text()).toContain("Signal");
      expect(apiMiss.status).toBe(404);
    });
  });

  it("returns 404 when the configured client directory lacks an index", async () => {
    mkdirSync(clientDir, { recursive: true });

    const app = createSignalServer({ clientPath: clientDir });
    await withServer(app, async (baseUrl) => {
      const index = await fetch(`${baseUrl}/dashboard`);

      expect(index.status).toBe(404);
      expect(await index.text()).toContain("Client assets not found.");
    });
  });
});
