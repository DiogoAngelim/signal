import { sleep } from "./time.js";

export async function runBatched<TItem, TResult>(
  items: TItem[],
  batchSize: number,
  batchDelayMs: number,
  handler: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const size = Math.max(1, Math.floor(batchSize));
  const delay = Math.max(0, Math.floor(batchDelayMs));
  const results: TResult[] = [];

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    const batchResults = await Promise.all(batch.map(handler));
    results.push(...batchResults);

    if (delay > 0 && index + size < items.length) {
      await sleep(delay);
    }
  }

  return results;
}
