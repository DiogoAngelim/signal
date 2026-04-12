import type { Logger } from "pino";
import { evaluatePolicy } from "../policy/engine.js";
import { createNormalizedEvent } from "../normalization/event.js";
import { InMemoryStore } from "../store/index.js";
import { createDedupeKey } from "../utils/dedupe.js";
import { EventService } from "./event-service.js";
import { WebsocketBroadcastService } from "../websocket/broadcast.js";

export interface DecisionContext {
  isDuplicate?: boolean;
  isCancellation?: boolean;
}

export class DecisionService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly eventService: EventService,
    private readonly websocket: WebsocketBroadcastService,
    private readonly logger: Logger
  ) { }

  compute(regionIds: string[], contextByRegion = new Map<string, DecisionContext>()): string[] {
    const updated: string[] = [];
    for (const regionId of regionIds) {
      const alerts = this.store.getAlerts(regionId);
      const risk = this.store.getRisk(regionId);
      const context = contextByRegion.get(regionId);
      const decision = evaluatePolicy({
        regionId,
        alerts,
        risk,
        isDuplicate: context?.isDuplicate,
        isCancellation: context?.isCancellation
      });

      const previousDecisions = this.store.listDecisions(regionId, 1);
      const previous = previousDecisions[0];
      const dedupeKey = createDedupeKey([
        regionId,
        decision.decision,
        decision.confidence,
        decision.reasons
      ]);
      const unchanged =
        previous &&
        createDedupeKey([
          regionId,
          previous.decision,
          previous.confidence,
          previous.reasons
        ]) === dedupeKey;

      if (unchanged) {
        continue;
      }

      this.store.addDecision(decision);

      const event = createNormalizedEvent({
        name: "weather.decision.made",
        provider: "policy-engine",
        regionId,
        payload: decision,
        dedupeKey,
        confidence: decision.confidence
      });

      this.eventService.publish(event);
      this.websocket.broadcast("weather.decisions", decision.decision, decision, regionId);
      updated.push(regionId);
    }

    this.logger.info({ count: updated.length }, "Policy decisions computed");
    return updated;
  }
}
