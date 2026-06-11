import { positiveInt } from "../config/signal-environment.js";
import { logger } from "../lib/logger.js";
import { getSignalWebhookDispatcher } from "../services/signal-distribution.js";

export async function runSignalQueueWorker(
  input: {
    pollMs?: number;
    batchSize?: number;
    signal?: AbortSignal;
  } = {},
) {
  const pollMs =
    input.pollMs ?? positiveInt(process.env.SIGNAL_QUEUE_WORKER_POLL_MS, 1_000);
  const batchSize =
    input.batchSize ??
    positiveInt(process.env.SIGNAL_QUEUE_WORKER_BATCH_SIZE, 10);

  while (!input.signal?.aborted) {
    try {
      const processed =
        await getSignalWebhookDispatcher().processDueJobsOnce(batchSize);
      if (processed === 0) {
        await sleep(pollMs, input.signal);
      }
    } catch (error) {
      logger.error({ err: error }, "Signal queue worker iteration failed");
      await sleep(pollMs, input.signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
