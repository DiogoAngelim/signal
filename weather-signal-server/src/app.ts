import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { Logger } from "pino";
import { registerRoutes, type RouteContext } from "./routes/index.js";
import { registerWebsocket } from "./websocket/handler.js";
import type { WebsocketBroadcastService } from "./websocket/broadcast.js";
import { ZodError } from "zod";
import { AppError } from "./utils/errors.js";
import { fail } from "./routes/response.js";

interface AppOptions {
  logger: Logger;
  routes: RouteContext;
  websocket: {
    broadcaster: WebsocketBroadcastService;
  };
}

export function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger
  });

  app.register(cors, { origin: true });
  app.register(rateLimit, { global: false });
  app.register(websocket);

  registerRoutes(app, options.routes);
  registerWebsocket(app, options.websocket.broadcaster);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send(fail("VALIDATION_ERROR", "Invalid request", error.issues));
      return;
    }
    options.logger.error({ error }, "Unhandled error");
    reply.status(500).send(fail("INTERNAL_ERROR", "Unexpected error"));
  });

  return app;
}
