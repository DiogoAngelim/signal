import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildHealthPayload, buildReadinessPayload } from "./observability/signal-health.js";
import {
  apiErrorHandler,
  createSignalCorsOptions,
  requestIdMiddleware,
  secureHeadersMiddleware,
} from "./observability/signal-http.js";

const app: Express = express();

app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(secureHeadersMiddleware);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(createSignalCorsOptions()));
app.use(express.json({ limit: process.env.SIGNAL_API_BODY_LIMIT ?? process.env.REQUEST_BODY_LIMIT ?? "1mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.SIGNAL_API_BODY_LIMIT ?? process.env.REQUEST_BODY_LIMIT ?? "1mb" }));

app.get("/health", (_req, res) => {
  res.json(buildHealthPayload());
});

app.get("/ready", async (_req, res, next) => {
  try {
    const payload = await buildReadinessPayload();
    res.status(payload.status === "ready" ? 200 : 503).json(payload);
  } catch (error) {
    next(error);
  }
});

app.use("/api", router);

// Serve frontend static files in production
if (
  !process.env.VERCEL &&
  (process.env.NODE_ENV === "production" ||
    process.env.SERVE_FRONTEND === "true")
) {
  const frontendPath = path.resolve(
    __dirname,
    "../../signal-markets/dist/public",
  );
  app.use(express.static(frontendPath));
  // Catch-all: serve index.html for any non-API route
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

app.use(apiErrorHandler);

export default app;
