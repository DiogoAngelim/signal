import assert from "node:assert/strict";
import test from "node:test";
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

test("Legacy calculates durable progression outputs", () => {
  const legacy = evaluateLegacy(institutionalInput());

  assert.equal(legacy.module, "signal.legacy");
  assert.equal(legacy.reputation.rank, "Institutional");
  assert.ok(legacy.reputation.score >= 80);
  assert.equal(legacy.title.name, "Institutional Operator");

  const achievementIds = legacy.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id);
  for (const id of ["first-clean-outcome", "three-clean-outcomes", "recovery-complete", "governance-approved", "institutional-operator"]) {
    assert.ok(achievementIds.includes(id), `expected achievement ${id}`);
  }

  const badgeIds = legacy.badges.map((badge) => badge.id);
  for (const id of ["recovery-specialist", "risk-master", "governance-champion", "institutional-operator"]) {
    assert.ok(badgeIds.includes(id), `expected badge ${id}`);
  }

  const completedCampaignIds = legacy.campaigns.filter((campaign) => campaign.status === "completed").map((campaign) => campaign.id);
  for (const id of ["restore-operating-authorization", "trust-restoration", "governance-clearance", "recovery-program"]) {
    assert.ok(completedCampaignIds.includes(id), `expected completed campaign ${id}`);
  }

  assert.ok(legacy.unlocks.map((unlock) => unlock.id).includes("prestige-eligibility"));
  assert.ok(legacy.milestones.map((milestone) => milestone.id).includes("institutional-authorization"));
  assert.equal(legacy.prestige.unlocked, true);
  assert.equal(legacy.prestige.level, 1);
});

test("Legacy emits replay-safe idempotent events", () => {
  const first = evaluateLegacy(institutionalInput());
  const replayed = replayLegacyEvents(first.events);
  const second = evaluateLegacy({
    ...institutionalInput(),
    history: replayed,
    eventLog: first.events,
  });

  const eventTypes = first.events.map((event) => event.type);
  for (const type of [
    "legacy.achievement.unlocked",
    "legacy.badge.earned",
    "legacy.milestone.reached",
    "legacy.unlock.granted",
    "legacy.title.changed",
    "legacy.reputation.updated",
    "legacy.campaign.completed",
    "legacy.prestige.unlocked",
    "legacy.victory.detected",
  ]) {
    assert.ok(eventTypes.includes(type as never), `expected event ${type}`);
  }
  assert.equal(new Set(first.events.map((event) => event.idempotencyKey)).size, first.events.length);
  assert.deepEqual(second.events, []);
});

test("Legacy preserves immutable history when current scores regress", () => {
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

  assert.ok(regressed.history.achievements.map((achievement) => achievement.id).includes("institutional-operator"));
  assert.ok(regressed.history.unlocks.map((unlock) => unlock.id).includes("prestige-eligibility"));
  assert.equal(regressed.history.campaigns.find((campaign) => campaign.id === "recovery-program")?.status, "completed");
  assert.equal(regressed.prestige.unlocked, true);
  assert.equal(regressed.title.name, "Institutional Operator");
});

test("Legacy supports configurable domain-neutral rules", () => {
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

  assert.equal(legacy.reputation.rank, "Commander");
  assert.equal(legacy.achievements[0]?.id, "two-completions");
  assert.equal(legacy.achievements[0]?.unlocked, true);
  assert.equal(legacy.title.name, "Quality Operator");
  assert.deepEqual(legacy.badges, []);
});

test("Legacy replays duplicate event keys once", () => {
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

  assert.equal(history.unlocks.length, 1);
  assert.equal(history.events.length, 1);
  assert.equal(history.unlocks[0]?.name, "Sample Unlock");
});

test("Legacy stores and restores history snapshots", () => {
  const store = new LegacyMemoryStore();
  const first = evaluateLegacy(institutionalInput());
  const snapshot = store.record(first);
  const restored = new LegacyMemoryStore(snapshot);
  const second = evaluateLegacy({
    ...institutionalInput(),
    history: restored.snapshot(),
  });

  assert.ok(snapshot.achievements.length > 0);
  assert.deepEqual(second.events, []);
  assert.deepEqual(restored.clear(), createLegacyHistory());
});
