import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import type { HealthStatus, SignalPayload, SignalResponse } from "./types";

const MAX_RESULTS = 50;
const results: SignalResponse[] = [];

function recordResult(response: SignalResponse) {
  results.unshift(response);
  if (results.length > MAX_RESULTS) {
    results.pop();
  }
}

function buildResponse(payload: SignalPayload): SignalResponse {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const operation = payload.operation?.trim() || "default";
  const status = operation === "emit" ? "processing" : "success";
  const message =
    status === "processing"
      ? "Signal queued for emission."
      : "Signal processed successfully.";

  const result = {
    operation,
    received: {
      message: payload.message,
      data: payload.data ?? null,
    },
    processedAt: timestamp,
  };

  return {
    id: crypto.randomUUID(),
    status,
    message,
    result,
    timestamp,
    duration: Date.now() - startedAt,
  };
}

export function createSignalApiRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", (_req, res) => {
    const data: HealthStatus = { status: "ok" };
    res.json(data);
  });

  router.post("/signal", (req, res) => {
    const payload = req.body as Partial<SignalPayload> | undefined;
    const message =
      typeof payload?.message === "string" ? payload.message.trim() : "";

    if (!message) {
      res.status(400).json({ message: "message is required." });
      return;
    }

    const response = buildResponse({
      message,
      operation:
        typeof payload?.operation === "string" ? payload.operation : undefined,
      data: payload?.data,
    });

    recordResult(response);
    res.json(response);
  });

  router.get("/signal/results", (_req, res) => {
    res.json(results);
  });

  return router;
}

export function getSignalResults(): SignalResponse[] {
  return [...results];
}
