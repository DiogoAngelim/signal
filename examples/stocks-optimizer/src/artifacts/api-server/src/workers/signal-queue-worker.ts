import { runSignalQueueWorker } from "../queues/signal-queue.js";
import { logger } from "../lib/logger.js";

const controller = new AbortController();

for (const event of ["SIGINT", "SIGTERM"] as const) {
  process.once(event, () => {
    logger.info({ event }, "Signal queue worker shutting down");
    controller.abort();
  });
}

await runSignalQueueWorker({ signal: controller.signal });
