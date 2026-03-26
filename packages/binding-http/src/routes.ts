import type { FastifyInstance } from "fastify";
import type { SignalRuntime } from "@signal/runtime";
import {
  handleMutationRequest,
  handleQueryRequest,
} from "./handlers";
import { handleCapabilitiesRequest } from "./capabilities-route";

export function registerSignalHttpRoutes(
  app: FastifyInstance,
  runtime: SignalRuntime
): FastifyInstance {
  app.get("/signal/capabilities", async (request, reply) =>
    handleCapabilitiesRequest(runtime, request, reply)
  );

  app.post("/signal/query/:name", async (request, reply) =>
    handleQueryRequest(runtime, request as never, reply)
  );

  app.post("/signal/mutation/:name", async (request, reply) =>
    handleMutationRequest(runtime, request as never, reply)
  );

  return app;
}
