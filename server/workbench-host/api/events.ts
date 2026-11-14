import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkbenchHostRequest } from "../src/handler.js";

export default function events(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return handleWorkbenchHostRequest(request, response, "/events");
}
