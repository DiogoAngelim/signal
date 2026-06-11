import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { assertSignalProductionReady } from "../config/signal-environment.js";
import {
  buildHealthPayload,
  buildReadinessPayload,
} from "../observability/signal-health.js";
import {
  ApiProblem,
  getRequestId,
  sendApiError,
} from "../observability/signal-http.js";
import {
  CreateApiKeySchema,
  RedriveQueueSchema,
  RotateApiKeySchema,
  parseSignalFilters,
} from "../schemas/signal-api.js";
import {
  assertProductionAuthReady,
  createManagedApiKey,
  requireSignalScopes,
  revokeManagedApiKey,
  rotateManagedApiKey,
  signalRateLimit,
  verifySignedIngestionRequest,
} from "../security/signal-security.js";
import {
  getSignalDistributionService,
  getSignalStreamHub,
  getSignalWebhookDispatcher,
} from "../services/signal-distribution.js";
import { getSignalStore, publicApiKey } from "../storage/signal-store.js";
import { responseForSignal } from "../streams/signal-stream.js";

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

  router.get(`${prefix}/openapi.json`, (_req, res) => {
    res.json(getSignalDistributionService().openApiSpec());
  });

  router.get(
    `${prefix}/metrics`,
    requireSignalScopes(["audit:read"]),
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
    requireSignalScopes(["signals:stream"]),
    signalRateLimit("stream"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(
          req.query as Record<string, unknown>,
        );
        await getSignalStreamHub().subscribe(req, res, filters);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/signals/latest`,
    requireSignalScopes(["signals:read"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(
          req.query as Record<string, unknown>,
        );
        const record = await getSignalDistributionService().latest(filters);

        if (!record) {
          sendApiError(
            req,
            res,
            404,
            "signal_not_found",
            "No matching signal is available.",
          );
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
    requireSignalScopes(["signals:read"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const filters = parseSignalFilters(
          req.query as Record<string, unknown>,
        );
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
    requireSignalScopes(["signals:read"]),
    signalRateLimit("signals-read"),
    async (req, res, next) => {
      try {
        const record = await getSignalDistributionService().get(
          String(req.params.id),
        );

        if (!record) {
          sendApiError(
            req,
            res,
            404,
            "signal_not_found",
            "Signal was not found.",
          );
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
    requireSignalScopes(["signals:emit"]),
    signalRateLimit("signals-emit"),
    async (req, res, next) => {
      try {
        assertProductionAuthReady();
        assertSignalProductionReady();
        const canonicalBody = JSON.stringify(
          req.body?.signal ?? req.body ?? {},
        );
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
    requireSignalScopes(["webhooks:write"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        const result = await getSignalWebhookDispatcher().register(
          req.body,
          (req as any).signalAuth?.keyId,
        );
        res.status(201).json(result);
      } catch (error) {
        next(
          normalizeZodError(
            error,
            "invalid_webhook",
            "Webhook registration failed validation.",
          ),
        );
      }
    },
  );

  router.get(
    `${prefix}/webhooks`,
    requireSignalScopes(["webhooks:read"]),
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
    requireSignalScopes(["webhooks:write"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        const deleted = await getSignalWebhookDispatcher().remove(
          String(req.params.id),
          (req as any).signalAuth?.keyId,
        );
        if (!deleted) {
          sendApiError(
            req,
            res,
            404,
            "webhook_not_found",
            "Webhook subscription was not found.",
          );
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
    requireSignalScopes(["webhooks:write"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        res.json(
          await getSignalWebhookDispatcher().sendTest(String(req.params.id)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/webhooks/:id/rotate-secret`,
    requireSignalScopes(["webhooks:write"]),
    signalRateLimit("webhooks"),
    async (req, res, next) => {
      try {
        res.json(
          await getSignalWebhookDispatcher().rotateSecret(
            String(req.params.id),
            req.body,
            (req as any).signalAuth?.keyId,
          ),
        );
      } catch (error) {
        next(
          normalizeZodError(
            error,
            "invalid_webhook_rotation",
            "Webhook secret rotation failed validation.",
          ),
        );
      }
    },
  );

  router.get(
    `${prefix}/audit/signals`,
    requireSignalScopes(["audit:read"]),
    signalRateLimit("audit"),
    async (req, res, next) => {
      try {
        const limit = z.coerce
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .parse(req.query.limit);
        res.json({ data: await getSignalDistributionService().audit(limit) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    `${prefix}/admin/api-keys`,
    requireSignalScopes(["admin:keys"]),
    signalRateLimit("admin-api-keys"),
    async (_req, res, next) => {
      try {
        const keys = await getSignalStore().listApiKeys();
        res.json({ data: keys.map(publicApiKey) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/admin/api-keys`,
    requireSignalScopes(["admin:keys"]),
    signalRateLimit("admin-api-keys"),
    async (req, res, next) => {
      try {
        const input = CreateApiKeySchema.parse(req.body);
        res
          .status(201)
          .json(
            await createManagedApiKey(input, (req as any).signalAuth?.keyId),
          );
      } catch (error) {
        next(
          normalizeZodError(
            error,
            "invalid_api_key_request",
            "API key creation failed validation.",
          ),
        );
      }
    },
  );

  router.post(
    `${prefix}/admin/api-keys/:id/rotate`,
    requireSignalScopes(["admin:keys"]),
    signalRateLimit("admin-api-keys"),
    async (req, res, next) => {
      try {
        const input = RotateApiKeySchema.parse(req.body ?? {});
        res.json(
          await rotateManagedApiKey(
            String(req.params.id),
            input,
            (req as any).signalAuth?.keyId,
          ),
        );
      } catch (error) {
        next(
          normalizeZodError(
            error,
            "invalid_api_key_rotation",
            "API key rotation failed validation.",
          ),
        );
      }
    },
  );

  router.post(
    `${prefix}/admin/api-keys/:id/revoke`,
    requireSignalScopes(["admin:keys"]),
    signalRateLimit("admin-api-keys"),
    async (req, res, next) => {
      try {
        res.json(
          await revokeManagedApiKey(
            String(req.params.id),
            (req as any).signalAuth?.keyId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    `${prefix}/admin/queue/redrive`,
    requireSignalScopes(["admin:keys"]),
    signalRateLimit("admin-queue"),
    async (req, res, next) => {
      try {
        const input = RedriveQueueSchema.parse(req.body ?? {});
        const redriven = await getSignalStore().redriveDeadLetterJobs(
          input.queue,
          input.ids,
        );
        res.json({ redriven });
      } catch (error) {
        next(
          normalizeZodError(
            error,
            "invalid_redrive_request",
            "Queue redrive failed validation.",
          ),
        );
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
