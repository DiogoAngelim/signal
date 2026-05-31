import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { buildHealthPayload, buildReadinessPayload } from "../observability/signal-health.js";
import { ApiProblem, getRequestId, sendApiError } from "../observability/signal-http.js";
import { parseSignalFilters } from "../schemas/signal-api.js";
import {
  assertProductionAuthReady,
  requireSignalRoles,
  signalRateLimit,
  verifySignedIngestionRequest,
} from "../security/signal-security.js";
import { getSignalDistributionService, getSignalStreamHub, getSignalWebhookDispatcher } from "../services/signal-distribution.js";
import { responseForSignal } from "../streams/signal-stream.js";
import { getSignalStore } from "../storage/signal-store.js";

export function createSignalApiRouter() {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json(buildHealthPayload());
  });

  router.get("/ready", async (_req, res, next) => {
    try {
      const payload = await buildReadinessPayload();
      res.status(payload.status === "ready" ? 200 : 503).json(payload);
    } catch (error) {
      next(error);
    }
  });

  mountSignalRoutes(router, "");
  mountSignalRoutes(router, "/v1");

  return router;
}

function mountSignalRoutes(router: Router, prefix: string) {
  router.get(`${prefix}/capabilities`, (_req, res) => {
    res.json(getSignalDistributionService().capabilities());
  });

  router.get(
    `${prefix}/metrics`,
    requireSignalRoles(["auditor"]),
    signalRateLimit("metrics"),
    async (_req, res, next) => {
      try {
        res.json(await getSignalDistributionService().metrics());
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/signals/stream`,
    requireSignalRoles(["reader"]),
    signalRateLimit("stream"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(req.query as Record<string, unknown>);
        await getSignalStreamHub().subscribe(req, res, filters);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/signals/latest`,
    requireSignalRoles(["reader"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(req.query as Record<string, unknown>);
        const record = await getSignalDistributionService().latest(filters);

        if (!record) {
          sendApiError(req, res, 404, "signal_not_found", "No matching signal is available.");
          return;
        }

        res.json(responseForSignal(record));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/signals`,
    requireSignalRoles(["reader"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(req.query as Record<string, unknown>);
        const records = await getSignalDistributionService().list(filters);
        res.json({
          data: records.map(responseForSignal),
          nextCursor: records.length ? String(records[0].sequence) : null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/signals/:id`,
    requireSignalRoles(["reader"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const record = await getSignalDistributionService().get(String(req.params.id));

        if (!record) {
          sendApiError(req, res, 404, "signal_not_found", "Signal was not found.");
          return;
        }

        res.json(responseForSignal(record));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/signals/emit`,
    requireSignalRoles(["emitter"]),
    signalRateLimit("signals-emit"),
    async (req, res, next) => {
      try {
        assertProductionAuthReady();
        const canonicalBody = JSON.stringify(req.body?.signal ?? req.body ?? {});
        const signed = await verifySignedIngestionRequest({
          headers: req.headers,
          body: canonicalBody,
          replayStore: getSignalStore(),
        });

        if (signed.ok === false) {
          sendApiError(req, res, signed.status, signed.code, signed.message);
          return;
        }

        const result = await getSignalDistributionService().emit(req.body, {
          requestId: getRequestId(req),
          actor: (req as any).signalAuth?.keyId,
        });

        res.status(result.accepted ? 202 : 200).json({
          accepted: result.accepted,
          duplicate: result.duplicate,
          latencyMs: result.latencyMs,
          ...responseForSignal(result.record),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/webhooks`,
    requireSignalRoles(["webhook_admin"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        const result = await getSignalWebhookDispatcher().register(req.body);
        res.status(201).json(result);
      } catch (error) {
        next(normalizeZodError(error, "invalid_webhook", "Webhook registration failed validation."));
      }
    },
  );

  router.get(
    `${prefix}/webhooks`,
    requireSignalRoles(["webhook_admin"]),
    signalRateLimit("webhooks"),
    async (_req, res, next) => {
      try {
        res.json({ data: await getSignalWebhookDispatcher().list() });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    `${prefix}/webhooks/:id`,
    requireSignalRoles(["webhook_admin"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        const deleted = await getSignalWebhookDispatcher().remove(String(req.params.id));
        if (!deleted) {
          sendApiError(req, res, 404, "webhook_not_found", "Webhook subscription was not found.");
          return;
        }
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/webhooks/:id/test`,
    requireSignalRoles(["webhook_admin"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        res.json(await getSignalWebhookDispatcher().sendTest(String(req.params.id)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/audit/signals`,
    requireSignalRoles(["auditor"]),
    signalRateLimit("audit"),
    async (req, res, next) => {
      try {
        const limit = z.coerce.number().int().min(1).max(500).default(100).parse(req.query.limit);
        res.json({ data: await getSignalDistributionService().audit(limit) });
      } catch (error) {
        next(error);
      }
    },
  );
}

function normalizeZodError(error: unknown, code: string, message: string) {
  if (error instanceof z.ZodError) {
    return new ApiProblem(
      400,
      code,
      message,
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return error;
}
