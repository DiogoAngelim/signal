import { describe, expect, it } from "vitest";
import {
  LegacyMemoryStore,
  createLegacyHistory,
  evaluateLegacy,
  replayLegacyEvents,
  type LegacyEvent,
} from "./engine";

const NOW = "2026-05-31T12:00:00.000Z";

function institutionalInput() {
  return {
    now: NOW,
    scores: {
      trust: 88,
      recovery: 86,
      governance: 84,
      survival: 90,
      agency: 87,
      wisdom: 83,
      discovery: 82,
      riskControl: 92,
    },
    counters: {
      cleanOutcomeCount: 3,
    },
    flags: {
      normalSizingRestored: true,
      governanceApproved: true,
      recoveryComplete: true,
      hasSurvivalScar: true,
    },
  };
}

describe("Legacy", () => {
  it("calculates configurable reputation, titles, achievements, badges, campaigns, unlocks, and prestige", () => {
    const legacy = evaluateLegacy(institutionalInput());

    expect(legacy.module).toBe("signal.legacy");
    expect(legacy.reputation.rank).toBe("Institutional");
    expect(legacy.reputation.score).toBeGreaterThanOrEqual(80);
    expect(legacy.title.name).toBe("Institutional Operator");
    expect(legacy.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id)).toEqual(
      expect.arrayContaining([
        "first-clean-outcome",
        "three-clean-outcomes",
        "recovery-complete",
        "governance-approved",
        "institutional-operator",
      ]),
    );
    expect(legacy.badges.map((badge) => badge.id)).toEqual(
      expect.arrayContaining([
        "recovery-specialist",
        "risk-master",
        "governance-champion",
        "institutional-operator",
      ]),
    );
    expect(legacy.campaigns.filter((campaign) => campaign.status === "completed").map((campaign) => campaign.id)).toEqual(
      expect.arrayContaining([
        "restore-operating-authorization",
        "trust-restoration",
        "governance-clearance",
        "recovery-program",
      ]),
    );
    expect(legacy.unlocks.map((unlock) => unlock.id)).toContain("prestige-eligibility");
    expect(legacy.milestones.map((milestone) => milestone.id)).toContain("institutional-authorization");
    expect(legacy.prestige.unlocked).toBe(true);
    expect(legacy.prestige.level).toBe(1);
    expect(legacy.victories.map((victory) => victory.type)).toEqual(
      expect.arrayContaining([
        "recovery-cleared",
        "trust-authorization-earned",
        "survival-memory-cleared",
        "governance-restored",
      ]),
    );
  });

  it("emits replay-safe idempotent events only for new accomplishments", () => {
    const first = evaluateLegacy(institutionalInput());
    const replayed = replayLegacyEvents(first.events);
    const second = evaluateLegacy({
      ...institutionalInput(),
      history: replayed,
      eventLog: first.events,
    });

    expect(first.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "legacy.achievement.unlocked",
        "legacy.badge.earned",
        "legacy.milestone.reached",
        "legacy.unlock.granted",
        "legacy.title.changed",
        "legacy.reputation.updated",
        "legacy.campaign.completed",
        "legacy.prestige.unlocked",
        "legacy.victory.detected",
      ]),
    );
    expect(new Set(first.events.map((event) => event.idempotencyKey)).size).toBe(first.events.length);
    expect(second.events).toEqual([]);
    expect(second.history.achievements.length).toBe(replayed.achievements.length);
    expect(second.history.unlocks.length).toBe(replayed.unlocks.length);
  });

  it("preserves immutable history when current scores regress", () => {
    const earned = evaluateLegacy(institutionalInput());
    const regressed = evaluateLegacy({
      now: "2026-06-01T12:00:00.000Z",
      history: earned.history,
      scores: {
        trust: 20,
        recovery: 15,
        governance: 10,
        survival: 30,
        agency: 25,
        wisdom: 10,
      },
      counters: {
        cleanOutcomeCount: 0,
      },
      flags: {},
    });

    expect(regressed.history.achievements.map((achievement) => achievement.id)).toContain("institutional-operator");
    expect(regressed.history.unlocks.map((unlock) => unlock.id)).toContain("prestige-eligibility");
    expect(regressed.history.campaigns.find((campaign) => campaign.id === "recovery-program")?.status).toBe("completed");
    expect(regressed.prestige.unlocked).toBe(true);
    expect(regressed.title.name).toBe("Institutional Operator");
  });

  it("supports configurable achievement and reputation rules without domain logic", () => {
    const legacy = evaluateLegacy({
      now: NOW,
      scores: {
        quality: 90,
        durability: 70,
      },
      counters: {
        completions: 2,
      },
      config: {
        reputationWeights: {
          quality: 0.75,
          durability: 0.25,
        },
        reputationThresholds: [
          { minScore: 0, rank: "Unknown" },
          { minScore: 50, rank: "Operator" },
          { minScore: 85, rank: "Commander" },
        ],
        achievements: [
          {
            id: "two-completions",
            name: "Two Completions",
            description: "Two domain-neutral completions were recorded.",
            rarity: "common",
            category: "custom",
            condition: { kind: "counter", counter: "completions", operator: ">=", value: 2 },
          },
        ],
        badges: [],
        milestones: [],
        unlocks: [],
        campaigns: [],
        titles: [
          {
            id: "quality-operator",
            name: "Quality Operator",
            priority: 1,
            reason: "Quality is high enough for a custom title.",
            condition: { kind: "score", metric: "quality", operator: ">=", value: 85 },
          },
        ],
        victories: [],
      },
    });

    expect(legacy.reputation.rank).toBe("Commander");
    expect(legacy.achievements).toEqual([
      expect.objectContaining({
        id: "two-completions",
        unlocked: true,
      }),
    ]);
    expect(legacy.title.name).toBe("Quality Operator");
    expect(legacy.badges).toEqual([]);
  });

  it("replays preexisting events and ignores duplicate idempotency keys", () => {
    const event: LegacyEvent = {
      type: "legacy.unlock.granted",
      timestamp: NOW,
      idempotencyKey: "legacy.unlock.granted:sample",
      payload: {
        unlock: {
          id: "sample",
          name: "Sample Unlock",
          source: "test",
          unlockedAt: NOW,
        },
      },
    };
    const history = replayLegacyEvents([event, event]);

    expect(history.unlocks).toHaveLength(1);
    expect(history.events).toHaveLength(1);
    expect(history.unlocks[0]?.name).toBe("Sample Unlock");
  });

  it("stores and restores persistent history snapshots", () => {
    const store = new LegacyMemoryStore();
    const first = evaluateLegacy(institutionalInput());
    const snapshot = store.record(first);
    const restored = new LegacyMemoryStore(snapshot);
    const second = evaluateLegacy({
      ...institutionalInput(),
      history: restored.snapshot(),
    });

    expect(snapshot.achievements.length).toBeGreaterThan(0);
    expect(second.events).toEqual([]);
    expect(restored.clear()).toEqual(createLegacyHistory());
  });
});
