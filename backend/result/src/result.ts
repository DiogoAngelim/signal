import type { ActionResult } from "@digelim/07.action";
import type { CoreDecision } from "@digelim/06.core";
import type { SignalEnvelope } from "@digelim/12.signal";

export type ResultRecord = {
  traceId: string;
  decision: CoreDecision;
  action: ActionResult;
  envelope?: SignalEnvelope;
  recordedAt: string;
};

export interface ResultStore {
  put(record: ResultRecord): Promise<void>;
  get(traceId: string): Promise<ResultRecord | null>;
}

export class InMemoryResultStore implements ResultStore {
  private readonly records = new Map<string, ResultRecord>();

  async put(record: ResultRecord): Promise<void> {
    this.records.set(record.traceId, record);
  }

  async get(traceId: string): Promise<ResultRecord | null> {
    return this.records.get(traceId) ?? null;
  }
}

export class ResultRecorder {
  constructor(private readonly store: ResultStore) {}

  async record(input: {
    traceId: string;
    decision: CoreDecision;
    action: ActionResult;
    envelope?: SignalEnvelope;
  }): Promise<ResultRecord> {
    const record: ResultRecord = {
      traceId: input.traceId,
      decision: input.decision,
      action: input.action,
      envelope: input.envelope,
      recordedAt: new Date().toISOString(),
    };

    await this.store.put(record);
    return record;
  }
}
