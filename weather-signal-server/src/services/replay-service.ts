import type { NormalizedEvent } from "../types/index.js";
import { InMemoryStore } from "../store/index.js";

export class ReplayService {
  constructor(private readonly store: InMemoryStore) { }

  getRecent(limit?: number): NormalizedEvent[] {
    return this.store.listEvents(limit);
  }
}
