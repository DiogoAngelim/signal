import { BinanceRateLimitError } from "./errors";
import type { ExecutionMetrics } from "./metrics";

type RetryableOperation<T> = () => Promise<T>;

export class RateLimiter {
  private queue: Promise<unknown> = Promise.resolve();
  private requestTimestamps: number[] = [];

  constructor(
    private readonly options: {
      maxRequestsPerMinute?: number;
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      metrics?: ExecutionMetrics;
      onIpBan?: (reason: string) => void;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {}

  schedule<T>(operation: RetryableOperation<T>): Promise<T> {
    const next = this.queue.then(() => this.withRetries(operation));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async withRetries<T>(operation: RetryableOperation<T>): Promise<T> {
    const maxRetries = this.options.maxRetries ?? 3;
    let attempt = 0;

    while (true) {
      await this.waitForSlot();
      try {
        return await operation();
      } catch (error) {
        if (error instanceof BinanceRateLimitError && error.banned) {
          this.options.metrics?.increment("rate_limit_events");
          this.options.onIpBan?.(error.message);
          throw error;
        }

        if (attempt >= maxRetries || !isRetryable(error)) throw error;
        this.options.metrics?.increment(error instanceof BinanceRateLimitError ? "rate_limit_events" : "api_failures");
        const retryAfterMs = error instanceof BinanceRateLimitError ? error.retryAfterMs : undefined;
        await this.delay(retryAfterMs ?? this.backoff(attempt));
        attempt += 1;
      }
    }
  }

  private async waitForSlot() {
    const limit = this.options.maxRequestsPerMinute ?? 1_100;
    const now = this.now();
    const windowMs = 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < windowMs);

    if (this.requestTimestamps.length >= limit) {
      const waitMs = windowMs - (now - this.requestTimestamps[0]);
      await this.delay(waitMs);
    }

    this.requestTimestamps.push(this.now());
  }

  private backoff(attempt: number) {
    const base = this.options.baseDelayMs ?? 250;
    const max = this.options.maxDelayMs ?? 5_000;
    const jitter = Math.floor(Math.random() * base);
    return Math.min(max, base * 2 ** attempt + jitter);
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private delay(ms: number) {
    return this.options.sleep ? this.options.sleep(Math.max(0, ms)) : new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}

function isRetryable(error: unknown) {
  if (error instanceof BinanceRateLimitError) return true;
  if (error instanceof Error) {
    return /timeout|temporar|network|fetch failed/i.test(error.message);
  }
  return false;
}
