import { logger } from "../lib/logger.js";
import { runSignalQueueWorker } from "../queues/signal-queue.js";

const controller = new AbortController();

for (const event of ["SIGINT", "SIGTERM"] as const) {
  process.once(event, () => {
    logger.info({ event }, "Signal queue worker shutting down");
    controller.abort();
  });
}

await runSignalQueueWorker({ signal: controller.signal });
