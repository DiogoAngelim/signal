import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkbenchHostRequest } from "../src/handler.js";

export default function health(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return handleWorkbenchHostRequest(request, response, "/health");
}
