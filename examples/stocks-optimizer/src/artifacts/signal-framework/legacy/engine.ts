import { clamp, mean, numeric } from "../math/statistics";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type ReputationRank =
  | "Unknown"
  | "Trainee"
  | "Operator"
  | "Commander"
  | "Institutional";

export type LegacyComparisonOperator = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type LegacyCondition =
  | {
      kind: "score";
      metric: string;
      operator: LegacyComparisonOperator;
      value: number;
    }
  | {
      kind: "counter";
      counter: string;
      operator: LegacyComparisonOperator;
      value: number;
    }
  | { kind: "flag"; flag: string; equals?: unknown }
  | { kind: "achievement"; id: string; unlocked?: boolean }
  | { kind: "campaign"; id: string; status: CampaignStatus }
  | { kind: "event"; type: LegacyEventType | string; count?: number }
  | { kind: "reputation"; operator: LegacyComparisonOperator; value: number }
  | { kind: "rank"; rank: ReputationRank }
  | { kind: "all"; conditions: LegacyCondition[] }
  | { kind: "any"; conditions: LegacyCondition[] }
  | { kind: "not"; condition: LegacyCondition };

export type LegacyRuleContext = {
  input: LegacyInput;
  scores: Record<string, number>;
  counters: Record<string, number>;
  flags: Record<string, unknown>;
  history: LegacyHistory;
  reputation: Reputation;
  unlockedAchievementIds: Set<string>;
  campaigns: Campaign[];
};

export type LegacyRulePredicate = (context: LegacyRuleContext) => boolean;

export type LegacyRuleProgress = (context: LegacyRuleContext) => number;

export type AchievementRule = {
  id: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  category: string;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
  progress?: LegacyRuleProgress;
};

export type BadgeRule = {
  id: string;
  name: string;
  tier: string;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
};

export type MilestoneRule = {
  id: string;
  name: string;
  category?: string;
  source?: string;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
  value?: LegacyRuleProgress;
};

export type UnlockRule = {
  id: string;
  name: string;
  source: string;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
};

export type CampaignStatus = "active" | "completed" | "failed";

export type CampaignRule = {
  id: string;
  name: string;
  startCondition?: LegacyCondition;
  completeCondition?: LegacyCondition;
  failCondition?: LegacyCondition;
  evaluateStart?: LegacyRulePredicate;
  evaluateComplete?: LegacyRulePredicate;
  evaluateFail?: LegacyRulePredicate;
};

export type OperatorTitleRule = {
  id: string;
  name: string;
  priority: number;
  reason: string;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
};

export type VictoryRule = {
  id: string;
  type: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  condition?: LegacyCondition;
  evaluate?: LegacyRulePredicate;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  rarity: AchievementRarity;
  category: string;
  progressPct: number;
};

export type Badge = {
  id: string;
  name: string;
  tier: string;
  earnedAt: string;
};

export type Reputation = {
  score: number;
  rank: ReputationRank;
};

export type OperatorTitle = {
  id: string;
  name: string;
  assignedAt: string;
  reason: string;
  reputationRank: ReputationRank;
  reputationScore: number;
};

export type Milestone = {
  id: string;
  name: string;
  reachedAt: string;
  source: string;
  category: string;
  value: number;
};

export type Unlock = {
  id: string;
  name: string;
  unlockedAt: string;
  source: string;
};

export type Campaign = {
  id: string;
  name: string;
  startedAt: string;
  completedAt?: string;
  status: CampaignStatus;
};

export type PrestigeState = {
  eligible: boolean;
  unlocked: boolean;
  level: number;
  unlockedAt?: string;
  badges: Badge[];
  titles: OperatorTitle[];
  requirements: Array<{
    metric: string;
    threshold: number;
    current: number;
    passed: boolean;
  }>;
};

export type LegacyVictory = {
  id: string;
  type: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  detectedAt: string;
};

export type LegacyHistory = {
  achievements: Achievement[];
  badges: Badge[];
  milestones: Milestone[];
  unlocks: Unlock[];
  campaigns: Campaign[];
  titles: OperatorTitle[];
  reputation: ReputationHistoryEntry[];
  prestige: PrestigeState | null;
  victories: LegacyVictory[];
  events: LegacyEvent[];
};

export type ReputationHistoryEntry = Reputation & {
  updatedAt: string;
};

export type LegacyEventType =
  | "legacy.achievement.unlocked"
  | "legacy.badge.earned"
  | "legacy.milestone.reached"
  | "legacy.unlock.granted"
  | "legacy.title.changed"
  | "legacy.reputation.updated"
  | "legacy.campaign.completed"
  | "legacy.prestige.unlocked"
  | "legacy.victory.detected";

export type LegacyEvent = {
  type: LegacyEventType;
  timestamp: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export type ReputationThreshold = {
  minScore: number;
  rank: ReputationRank;
};

export type LegacyConfig = {
  reputationWeights?: Record<string, number>;
  reputationThresholds?: ReputationThreshold[];
  achievements?: AchievementRule[];
  badges?: BadgeRule[];
  milestones?: MilestoneRule[];
  unlocks?: UnlockRule[];
  campaigns?: CampaignRule[];
  titles?: OperatorTitleRule[];
  victories?: VictoryRule[];
  prestigeRequirements?: Record<string, number>;
};

export type LegacyInput = {
  now?: string | number | Date;
  scores?: Record<string, number | null | undefined>;
  counters?: Record<string, number | null | undefined>;
  flags?: Record<string, unknown>;
  history?: Partial<LegacyHistory> | null;
  eventLog?: LegacyEvent[];
  config?: LegacyConfig;
};

export type LegacyOutput = {
  module: "signal.legacy";
  name: "Signal Legacy";
  score: number;
  reputation: Reputation;
  title: OperatorTitle;
  achievements: Achievement[];
  badges: Badge[];
  milestones: Milestone[];
  unlocks: Unlock[];
  campaigns: Campaign[];
  prestige: PrestigeState;
  history: LegacyHistory;
  victories: LegacyVictory[];
  events: LegacyEvent[];
  audit: {
    reputationWeights: Record<string, number>;
    reputationThresholds: ReputationThreshold[];
    achievementCompletionPct: number;
    campaignCompletionPct: number;
    formulas: string[];
  };
};

export const DEFAULT_REPUTATION_WEIGHTS: Record<string, number> = {
  trust: 0.2,
  recovery: 0.2,
  governance: 0.2,
  survival: 0.15,
  agency: 0.15,
  wisdom: 0.1,
};

export const DEFAULT_REPUTATION_THRESHOLDS: ReputationThreshold[] = [
  { minScore: 0, rank: "Unknown" },
  { minScore: 20, rank: "Trainee" },
  { minScore: 40, rank: "Operator" },
  { minScore: 60, rank: "Commander" },
  { minScore: 80, rank: "Institutional" },
];

export const DEFAULT_PRESTIGE_REQUIREMENTS: Record<string, number> = {
  trust: 80,
  recovery: 80,
  governance: 80,
  wisdom: 80,
  agency: 80,
};

export const DEFAULT_ACHIEVEMENT_RULES: AchievementRule[] = [
  {
    id: "first-clean-outcome",
    name: "First Clean Outcome",
    description: "Record one clean outcome without a boundary break.",
    rarity: "common",
    category: "outcome",
    condition: {
      kind: "counter",
      counter: "cleanOutcomeCount",
      operator: ">=",
      value: 1,
    },
    progress: (context) =>
      progressAtLeast(context.counters.cleanOutcomeCount, 1),
  },
  {
    id: "three-clean-outcomes",
    name: "Three Clean Outcomes",
    description: "Record three clean outcomes without a boundary break.",
    rarity: "rare",
    category: "outcome",
    condition: {
      kind: "counter",
      counter: "cleanOutcomeCount",
      operator: ">=",
      value: 3,
    },
    progress: (context) =>
      progressAtLeast(context.counters.cleanOutcomeCount, 3),
  },
  {
    id: "recovery-complete",
    name: "Recovery Complete",
    description:
      "Recovery evidence has cleared the configured accomplishment threshold.",
    rarity: "rare",
    category: "recovery",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "recovery", operator: ">=", value: 80 },
        { kind: "flag", flag: "recoveryComplete", equals: true },
        { kind: "flag", flag: "normalSizingRestored", equals: true },
      ],
    },
    progress: (context) =>
      maxProgress(
        progressAtLeast(context.scores.recovery, 80),
        flagProgress(context.flags.recoveryComplete),
        flagProgress(context.flags.normalSizingRestored),
      ),
  },
  {
    id: "governance-approved",
    name: "Governance Approved",
    description: "Governance has approved durable operator authority.",
    rarity: "rare",
    category: "governance",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "governance", operator: ">=", value: 80 },
        { kind: "flag", flag: "governanceApproved", equals: true },
      ],
    },
    progress: (context) =>
      maxProgress(
        progressAtLeast(context.scores.governance, 80),
        flagProgress(context.flags.governanceApproved),
      ),
  },
  {
    id: "trust-architect",
    name: "Trust Architect",
    description: "Trust reached an institutional-quality threshold.",
    rarity: "epic",
    category: "trust",
    condition: { kind: "score", metric: "trust", operator: ">=", value: 80 },
    progress: (context) => progressAtLeast(context.scores.trust, 80),
  },
  {
    id: "discovery-master",
    name: "Discovery Master",
    description:
      "Discovery maturity became durable enough to count as earned progress.",
    rarity: "epic",
    category: "discovery",
    condition: {
      kind: "score",
      metric: "discovery",
      operator: ">=",
      value: 80,
    },
    progress: (context) => progressAtLeast(context.scores.discovery, 80),
  },
  {
    id: "wisdom-keeper",
    name: "Wisdom Keeper",
    description: "Wisdom crossed the long-term learning threshold.",
    rarity: "epic",
    category: "wisdom",
    condition: { kind: "score", metric: "wisdom", operator: ">=", value: 80 },
    progress: (context) => progressAtLeast(context.scores.wisdom, 80),
  },
  {
    id: "institutional-operator",
    name: "Institutional Operator",
    description:
      "Trust, recovery, governance, agency, and wisdom are all institutionally ready.",
    rarity: "legendary",
    category: "institutional",
    condition: {
      kind: "all",
      conditions: Object.entries(DEFAULT_PRESTIGE_REQUIREMENTS).map(
        ([metric, value]) => ({
          kind: "score",
          metric,
          operator: ">=",
          value,
        }),
      ),
    },
    progress: (context) =>
      mean(
        Object.entries(DEFAULT_PRESTIGE_REQUIREMENTS).map(([metric, value]) =>
          progressAtLeast(context.scores[metric], value),
        ),
      ),
  },
];

export const DEFAULT_BADGE_RULES: BadgeRule[] = [
  {
    id: "recovery-specialist",
    name: "Recovery Specialist",
    tier: "Rare",
    condition: { kind: "score", metric: "recovery", operator: ">=", value: 80 },
  },
  {
    id: "capital-guardian",
    name: "Capital Guardian",
    tier: "Epic",
    condition: {
      kind: "score",
      metric: "riskControl",
      operator: ">=",
      value: 85,
    },
  },
  {
    id: "risk-master",
    name: "Risk Master",
    tier: "Epic",
    condition: {
      kind: "score",
      metric: "riskControl",
      operator: ">=",
      value: 90,
    },
  },
  {
    id: "discovery-hunter",
    name: "Discovery Hunter",
    tier: "Rare",
    condition: {
      kind: "score",
      metric: "discovery",
      operator: ">=",
      value: 70,
    },
  },
  {
    id: "governance-champion",
    name: "Governance Champion",
    tier: "Epic",
    condition: {
      kind: "score",
      metric: "governance",
      operator: ">=",
      value: 80,
    },
  },
  {
    id: "institutional-operator",
    name: "Institutional Operator",
    tier: "Legendary",
    condition: {
      kind: "achievement",
      id: "institutional-operator",
      unlocked: true,
    },
  },
];

export const DEFAULT_MILESTONE_RULES: MilestoneRule[] = [
  {
    id: "survival-reached-70",
    name: "Survival reached 70",
    source: "survival",
    category: "score",
    condition: { kind: "score", metric: "survival", operator: ">=", value: 70 },
    value: (context) => context.scores.survival ?? 0,
  },
  {
    id: "trust-reached-80",
    name: "Trust reached 80",
    source: "trust",
    category: "score",
    condition: { kind: "score", metric: "trust", operator: ">=", value: 80 },
    value: (context) => context.scores.trust ?? 0,
  },
  {
    id: "governance-approved",
    name: "Governance approved",
    source: "governance",
    category: "authorization",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "governance", operator: ">=", value: 80 },
        { kind: "flag", flag: "governanceApproved", equals: true },
      ],
    },
    value: (context) =>
      context.scores.governance ?? flagValue(context.flags.governanceApproved),
  },
  {
    id: "recovery-cleared",
    name: "Recovery cleared",
    source: "recovery",
    category: "recovery",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "recovery", operator: ">=", value: 80 },
        { kind: "flag", flag: "recoveryComplete", equals: true },
      ],
    },
    value: (context) =>
      context.scores.recovery ?? flagValue(context.flags.recoveryComplete),
  },
  {
    id: "normal-sizing-restored",
    name: "First normal sizing restoration",
    source: "recovery",
    category: "unlock",
    condition: { kind: "flag", flag: "normalSizingRestored", equals: true },
    value: (context) => flagValue(context.flags.normalSizingRestored),
  },
  {
    id: "institutional-authorization",
    name: "First institutional authorization",
    source: "legacy",
    category: "authorization",
    condition: { kind: "reputation", operator: ">=", value: 80 },
    value: (context) => context.reputation.score,
  },
];

export const DEFAULT_UNLOCK_RULES: UnlockRule[] = [
  {
    id: "normal-sizing-restored",
    name: "Normal sizing restored",
    source: "recovery",
    condition: {
      kind: "any",
      conditions: [
        { kind: "flag", flag: "normalSizingRestored", equals: true },
        { kind: "score", metric: "recovery", operator: ">=", value: 80 },
      ],
    },
  },
  {
    id: "governance-authorization",
    name: "Governance authorization",
    source: "governance",
    condition: {
      kind: "any",
      conditions: [
        { kind: "flag", flag: "governanceApproved", equals: true },
        { kind: "score", metric: "governance", operator: ">=", value: 80 },
      ],
    },
  },
  {
    id: "new-exposure-authorization",
    name: "New exposure authorization",
    source: "agency",
    condition: {
      kind: "any",
      conditions: [
        { kind: "flag", flag: "newExposureAuthorized", equals: true },
        {
          kind: "all",
          conditions: [
            { kind: "score", metric: "trust", operator: ">=", value: 70 },
            { kind: "score", metric: "agency", operator: ">=", value: 70 },
          ],
        },
      ],
    },
  },
  {
    id: "prestige-eligibility",
    name: "Prestige eligibility",
    source: "legacy",
    condition: {
      kind: "all",
      conditions: Object.entries(DEFAULT_PRESTIGE_REQUIREMENTS).map(
        ([metric, value]) => ({
          kind: "score",
          metric,
          operator: ">=",
          value,
        }),
      ),
    },
  },
];

export const DEFAULT_CAMPAIGN_RULES: CampaignRule[] = [
  {
    id: "restore-operating-authorization",
    name: "Restore Operating Authorization",
    startCondition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "recovery", operator: ">", value: 0 },
        { kind: "score", metric: "survival", operator: ">", value: 0 },
        { kind: "flag", flag: "hasSurvivalScar", equals: true },
      ],
    },
    completeCondition: {
      kind: "any",
      conditions: [
        { kind: "flag", flag: "normalSizingRestored", equals: true },
        { kind: "score", metric: "recovery", operator: ">=", value: 80 },
      ],
    },
  },
  {
    id: "trust-restoration",
    name: "Trust Restoration",
    startCondition: { kind: "score", metric: "trust", operator: ">", value: 0 },
    completeCondition: {
      kind: "score",
      metric: "trust",
      operator: ">=",
      value: 80,
    },
  },
  {
    id: "governance-clearance",
    name: "Governance Clearance",
    startCondition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "governance", operator: ">", value: 0 },
        { kind: "flag", flag: "governanceApproved", equals: true },
      ],
    },
    completeCondition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "governance", operator: ">=", value: 80 },
        { kind: "flag", flag: "governanceApproved", equals: true },
      ],
    },
  },
  {
    id: "recovery-program",
    name: "Recovery Program",
    startCondition: {
      kind: "score",
      metric: "recovery",
      operator: ">",
      value: 0,
    },
    completeCondition: {
      kind: "score",
      metric: "recovery",
      operator: ">=",
      value: 80,
    },
  },
];

export const DEFAULT_TITLE_RULES: OperatorTitleRule[] = [
  {
    id: "institutional-operator",
    name: "Institutional Operator",
    priority: 900,
    reason: "Prestige-level requirements are satisfied.",
    condition: {
      kind: "achievement",
      id: "institutional-operator",
      unlocked: true,
    },
  },
  {
    id: "wisdom-keeper",
    name: "Wisdom Keeper",
    priority: 700,
    reason: "Wisdom is the strongest earned capability.",
    condition: { kind: "score", metric: "wisdom", operator: ">=", value: 85 },
  },
  {
    id: "governance-steward",
    name: "Governance Steward",
    priority: 650,
    reason: "Governance has become a durable source of authority.",
    condition: {
      kind: "score",
      metric: "governance",
      operator: ">=",
      value: 85,
    },
  },
  {
    id: "trust-architect",
    name: "Trust Architect",
    priority: 625,
    reason: "Trust has crossed an institutional threshold.",
    condition: { kind: "score", metric: "trust", operator: ">=", value: 85 },
  },
  {
    id: "recovery-specialist",
    name: "Recovery Specialist",
    priority: 600,
    reason: "Recovery has become the defining permanent accomplishment.",
    condition: { kind: "score", metric: "recovery", operator: ">=", value: 80 },
  },
  {
    id: "discovery-hunter",
    name: "Discovery Hunter",
    priority: 525,
    reason: "Discovery progress is the strongest earned capability.",
    condition: {
      kind: "score",
      metric: "discovery",
      operator: ">=",
      value: 75,
    },
  },
  {
    id: "probe-operator",
    name: "Probe Operator",
    priority: 100,
    reason:
      "Operator authority is still being earned through constrained participation.",
    condition: { kind: "reputation", operator: ">=", value: 20 },
  },
  {
    id: "unknown-operator",
    name: "Unknown Operator",
    priority: 0,
    reason: "Legacy has not yet observed enough earned progression.",
    condition: { kind: "reputation", operator: ">=", value: 0 },
  },
];

export const DEFAULT_VICTORY_RULES: VictoryRule[] = [
  {
    id: "recovery-cleared",
    type: "recovery-cleared",
    title: "Recovery cleared",
    description:
      "Recovery evidence has crossed the permanent accomplishment threshold.",
    rarity: "rare",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "recovery", operator: ">=", value: 80 },
        { kind: "flag", flag: "recoveryComplete", equals: true },
      ],
    },
  },
  {
    id: "trust-authorization-earned",
    type: "trust-authorization-earned",
    title: "Trust authorization earned",
    description: "Trust is high enough to become durable operator history.",
    rarity: "rare",
    condition: { kind: "score", metric: "trust", operator: ">=", value: 80 },
  },
  {
    id: "survival-memory-cleared",
    type: "survival-memory-cleared",
    title: "Survival memory cleared",
    description:
      "Survival has recovered enough to stop being a temporary state.",
    rarity: "epic",
    condition: { kind: "score", metric: "survival", operator: ">=", value: 80 },
  },
  {
    id: "governance-restored",
    type: "governance-restored",
    title: "Governance restored",
    description: "Governance has restored durable authority.",
    rarity: "epic",
    condition: {
      kind: "any",
      conditions: [
        { kind: "score", metric: "governance", operator: ">=", value: 80 },
        { kind: "flag", flag: "governanceApproved", equals: true },
      ],
    },
  },
];

export function evaluateLegacy(input: LegacyInput = {}): LegacyOutput {
  const now = toIsoTimestamp(input.now);
  const scores = normalizeNumberRecord(input.scores);
  const counters = normalizeNumberRecord(input.counters);
  const flags = { ...(input.flags ?? {}) };
  const config = input.config ?? {};
  const reputationWeights = config.reputationWeights
    ? { ...config.reputationWeights }
    : { ...DEFAULT_REPUTATION_WEIGHTS };
  const reputationThresholds = normalizeThresholds(
    config.reputationThresholds ?? DEFAULT_REPUTATION_THRESHOLDS,
  );
  const baseHistory = normalizeHistory(input.history);
  const previous = replayLegacyEvents(input.eventLog ?? [], baseHistory);
  const existingEventKeys = new Set(
    previous.events.map((event) => event.idempotencyKey),
  );
  const events: LegacyEvent[] = [];

  const reputation = calculateReputation(
    scores,
    reputationWeights,
    reputationThresholds,
  );
  const emptyContext: LegacyRuleContext = {
    input,
    scores,
    counters,
    flags,
    history: previous,
    reputation,
    unlockedAchievementIds: new Set(
      previous.achievements.map((achievement) => achievement.id),
    ),
    campaigns: previous.campaigns,
  };

  const campaigns = deriveCampaigns({
    rules: config.campaigns ?? DEFAULT_CAMPAIGN_RULES,
    previous,
    context: emptyContext,
    now,
  });
  const contextWithCampaigns = { ...emptyContext, campaigns };
  const achievements = deriveAchievements({
    rules: config.achievements ?? DEFAULT_ACHIEVEMENT_RULES,
    previous,
    context: contextWithCampaigns,
    now,
  });
  const unlockedAchievementIds = new Set([
    ...previous.achievements.map((achievement) => achievement.id),
    ...achievements
      .filter((achievement) => achievement.unlocked)
      .map((achievement) => achievement.id),
  ]);
  const context: LegacyRuleContext = {
    ...contextWithCampaigns,
    unlockedAchievementIds,
    campaigns,
  };
  const badges = deriveBadges({
    rules: config.badges ?? DEFAULT_BADGE_RULES,
    previous,
    context,
    now,
  });
  const milestones = deriveMilestones({
    rules: config.milestones ?? DEFAULT_MILESTONE_RULES,
    previous,
    context,
    now,
  });
  const unlocks = deriveUnlocks({
    rules: config.unlocks ?? DEFAULT_UNLOCK_RULES,
    previous,
    context,
    now,
  });
  const prestige = derivePrestige({
    previous,
    scores,
    now,
    reputation,
    requirements: config.prestigeRequirements ?? DEFAULT_PRESTIGE_REQUIREMENTS,
  });
  const title = selectTitle({
    rules: config.titles ?? DEFAULT_TITLE_RULES,
    previous,
    context,
    now,
    reputation,
  });
  const victories = deriveVictories({
    rules: config.victories ?? DEFAULT_VICTORY_RULES,
    previous,
    context,
    now,
  });

  for (const achievement of achievements) {
    if (
      achievement.unlocked &&
      !previous.achievements.some((item) => item.id === achievement.id)
    ) {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.achievement.unlocked",
        now,
        achievement.id,
        { achievement },
      );
    }
  }
  for (const badge of badges) {
    if (!previous.badges.some((item) => item.id === badge.id)) {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.badge.earned",
        now,
        badge.id,
        { badge },
      );
    }
  }
  for (const milestone of milestones) {
    if (!previous.milestones.some((item) => item.id === milestone.id)) {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.milestone.reached",
        now,
        milestone.id,
        { milestone },
      );
    }
  }
  for (const unlock of unlocks) {
    if (!previous.unlocks.some((item) => item.id === unlock.id)) {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.unlock.granted",
        now,
        unlock.id,
        { unlock },
      );
    }
  }
  for (const campaign of campaigns) {
    const earlier = previous.campaigns.find((item) => item.id === campaign.id);
    if (campaign.status === "completed" && earlier?.status !== "completed") {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.campaign.completed",
        now,
        campaign.id,
        { campaign },
      );
    }
  }
  const previousReputation =
    previous.reputation[previous.reputation.length - 1] ?? null;
  if (
    !previousReputation ||
    previousReputation.rank !== reputation.rank ||
    previousReputation.score !== reputation.score
  ) {
    emitLegacyEvent(
      events,
      existingEventKeys,
      "legacy.reputation.updated",
      now,
      `${previousReputation?.rank ?? "none"}:${reputation.rank}:${reputation.score}`,
      {
        reputation,
        previous: previousReputation,
      },
    );
  }
  const previousTitle = previous.titles[previous.titles.length - 1] ?? null;
  if (!previousTitle || previousTitle.id !== title.id) {
    emitLegacyEvent(
      events,
      existingEventKeys,
      "legacy.title.changed",
      now,
      `${previousTitle?.id ?? "none"}:${title.id}`,
      {
        title,
        previous: previousTitle,
      },
    );
  }
  if (prestige.unlocked && previous.prestige?.unlocked !== true) {
    emitLegacyEvent(
      events,
      existingEventKeys,
      "legacy.prestige.unlocked",
      now,
      "prestige",
      { prestige },
    );
  }
  for (const victory of victories) {
    if (!previous.victories.some((item) => item.id === victory.id)) {
      emitLegacyEvent(
        events,
        existingEventKeys,
        "legacy.victory.detected",
        now,
        victory.id,
        { victory },
      );
    }
  }

  const reputationHistory =
    previousReputation?.rank === reputation.rank &&
    previousReputation.score === reputation.score
      ? previous.reputation
      : [...previous.reputation, { ...reputation, updatedAt: now }];
  const titleHistory =
    previousTitle?.id === title.id
      ? previous.titles
      : [...previous.titles, title];
  const allEvents = [...previous.events, ...events];
  const history = normalizeHistory({
    achievements: achievements.filter((achievement) => achievement.unlocked),
    badges,
    milestones,
    unlocks,
    campaigns,
    titles: titleHistory,
    reputation: reputationHistory,
    prestige,
    victories,
    events: allEvents,
  });
  const achievementCompletionPct = achievements.length
    ? round(
        mean(
          achievements.map((achievement) =>
            achievement.unlocked ? 100 : achievement.progressPct,
          ),
        ),
      )
    : 0;
  const campaignCompletionPct = campaigns.length
    ? round(
        mean(
          campaigns.map((campaign) =>
            campaign.status === "completed"
              ? 100
              : campaign.status === "active"
                ? 50
                : 0,
          ),
        ),
      )
    : 0;
  const score = round(
    clamp(
      reputation.score * 0.65 +
        achievementCompletionPct * 0.15 +
        campaignCompletionPct * 0.1 +
        clamp((milestones.length / 8) * 100) * 0.05 +
        clamp((unlocks.length / 6) * 100) * 0.05,
    ),
  );

  return {
    module: "signal.legacy",
    name: "Signal Legacy",
    score,
    reputation,
    title,
    achievements,
    badges,
    milestones,
    unlocks,
    campaigns,
    prestige,
    history,
    victories,
    events,
    audit: {
      reputationWeights,
      reputationThresholds,
      achievementCompletionPct,
      campaignCompletionPct,
      formulas: [
        "reputation.score is a configurable weighted score across trust, recovery, governance, survival, agency, and wisdom",
        "achievements, badges, milestones, unlocks, campaigns, victories, and prestige are emitted only when their configured rules first become true",
        "history is append-only by entity id and replayed events are applied before new events are considered",
        "legacy.score combines reputation, achievement completion, campaign completion, milestones, and unlocks without making domain decisions",
      ],
    },
  };
}

export function replayLegacyEvents(
  events: LegacyEvent[],
  baseHistory: Partial<LegacyHistory> | null = null,
): LegacyHistory {
  let history = normalizeHistory(baseHistory);
  const seen = new Set(history.events.map((event) => event.idempotencyKey));

  for (const event of events) {
    if (seen.has(event.idempotencyKey)) continue;
    seen.add(event.idempotencyKey);
    history = applyLegacyEvent(history, event);
  }

  return normalizeHistory(history);
}

export class LegacyMemoryStore {
  private history: LegacyHistory;

  constructor(history: Partial<LegacyHistory> | null = null) {
    this.history = normalizeHistory(history);
  }

  snapshot(): LegacyHistory {
    return copy(this.history);
  }

  load(history: Partial<LegacyHistory> | null): LegacyHistory {
    this.history = normalizeHistory(history);
    return this.snapshot();
  }

  record(output: LegacyOutput): LegacyHistory {
    this.history = normalizeHistory(output.history);
    return this.snapshot();
  }

  replay(events: LegacyEvent[]): LegacyHistory {
    this.history = replayLegacyEvents(events, this.history);
    return this.snapshot();
  }

  clear(): LegacyHistory {
    this.history = emptyHistory();
    return this.snapshot();
  }
}

export function createLegacyHistory(
  history: Partial<LegacyHistory> | null = null,
): LegacyHistory {
  return normalizeHistory(history);
}

function deriveAchievements(args: {
  rules: AchievementRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const previousById = new Map(
    args.previous.achievements.map((achievement) => [
      achievement.id,
      achievement,
    ]),
  );
  const achievements = args.rules.map((rule) => {
    const previous = previousById.get(rule.id);
    const unlocked = Boolean(previous) || ruleMatches(rule, args.context);
    const progressPct = unlocked
      ? 100
      : clamp(
          rule.progress?.(args.context) ??
            progressFromCondition(rule.condition, args.context),
        );
    return {
      id: rule.id,
      name: previous?.name ?? rule.name,
      description: previous?.description ?? rule.description,
      unlocked,
      ...(unlocked ? { unlockedAt: previous?.unlockedAt ?? args.now } : {}),
      rarity: previous?.rarity ?? rule.rarity,
      category: previous?.category ?? rule.category,
      progressPct: round(progressPct),
    };
  });
  const ruleIds = new Set(args.rules.map((rule) => rule.id));
  return [
    ...achievements,
    ...args.previous.achievements.filter(
      (achievement) => !ruleIds.has(achievement.id),
    ),
  ];
}

function deriveBadges(args: {
  rules: BadgeRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const badges = [...args.previous.badges];
  for (const rule of args.rules) {
    if (badges.some((badge) => badge.id === rule.id)) continue;
    if (ruleMatches(rule, args.context)) {
      badges.push({
        id: rule.id,
        name: rule.name,
        tier: rule.tier,
        earnedAt: args.now,
      });
    }
  }
  return uniqueById(badges);
}

function deriveMilestones(args: {
  rules: MilestoneRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const milestones = [...args.previous.milestones];
  for (const rule of args.rules) {
    if (milestones.some((milestone) => milestone.id === rule.id)) continue;
    if (ruleMatches(rule, args.context)) {
      milestones.push({
        id: rule.id,
        name: rule.name,
        reachedAt: args.now,
        source: rule.source ?? rule.id,
        category: rule.category ?? "progression",
        value: round(
          clamp(
            rule.value?.(args.context) ??
              progressFromCondition(rule.condition, args.context),
          ),
        ),
      });
    }
  }
  return uniqueById(milestones);
}

function deriveUnlocks(args: {
  rules: UnlockRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const unlocks = [...args.previous.unlocks];
  for (const rule of args.rules) {
    if (unlocks.some((unlock) => unlock.id === rule.id)) continue;
    if (ruleMatches(rule, args.context)) {
      unlocks.push({
        id: rule.id,
        name: rule.name,
        unlockedAt: args.now,
        source: rule.source,
      });
    }
  }
  return uniqueById(unlocks);
}

function deriveCampaigns(args: {
  rules: CampaignRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const campaigns = [...args.previous.campaigns];
  for (const rule of args.rules) {
    const existing = campaigns.find((campaign) => campaign.id === rule.id);
    if (existing?.status === "completed") continue;

    const started =
      Boolean(existing) ||
      ruleMatches(
        {
          condition: rule.startCondition,
          evaluate: rule.evaluateStart,
        },
        args.context,
      );
    if (!started) continue;

    const failed = ruleMatches(
      {
        condition: rule.failCondition,
        evaluate: rule.evaluateFail,
      },
      args.context,
    );
    const completed =
      !failed &&
      ruleMatches(
        {
          condition: rule.completeCondition,
          evaluate: rule.evaluateComplete,
        },
        args.context,
      );
    const next: Campaign = {
      id: rule.id,
      name: existing?.name ?? rule.name,
      startedAt: existing?.startedAt ?? args.now,
      ...(completed ? { completedAt: existing?.completedAt ?? args.now } : {}),
      status: completed ? "completed" : failed ? "failed" : "active",
    };

    if (existing) {
      const index = campaigns.findIndex((campaign) => campaign.id === rule.id);
      campaigns[index] = next;
    } else {
      campaigns.push(next);
    }
  }
  return uniqueById(campaigns);
}

function derivePrestige(args: {
  previous: LegacyHistory;
  scores: Record<string, number>;
  now: string;
  reputation: Reputation;
  requirements: Record<string, number>;
}) {
  const requirements = Object.entries(args.requirements).map(
    ([metric, threshold]) => {
      const current = round(clamp(args.scores[metric] ?? 0));
      return {
        metric,
        threshold,
        current,
        passed: current >= threshold,
      };
    },
  );
  const eligible = requirements.every((requirement) => requirement.passed);
  const minimumRequirementScore = requirements.length
    ? Math.min(...requirements.map((requirement) => requirement.current))
    : 0;
  const earnedLevel = eligible
    ? minimumRequirementScore >= 96
      ? 3
      : minimumRequirementScore >= 90
        ? 2
        : 1
    : 0;
  const unlocked = args.previous.prestige?.unlocked === true || eligible;
  const level = unlocked
    ? Math.max(earnedLevel, args.previous.prestige?.level ?? 0, 1)
    : 0;
  const unlockedAt =
    args.previous.prestige?.unlockedAt ?? (unlocked ? args.now : undefined);
  const prestigeBadge: Badge = {
    id: "prestige-operator",
    name: "Prestige Operator",
    tier: "Prestige",
    earnedAt: unlockedAt ?? args.now,
  };
  const prestigeTitle: OperatorTitle = {
    id: "prestige-institutional-operator",
    name: "Institutional Operator",
    assignedAt: unlockedAt ?? args.now,
    reason: "Prestige eligibility was permanently unlocked.",
    reputationRank: args.reputation.rank,
    reputationScore: args.reputation.score,
  };

  return {
    eligible,
    unlocked,
    level,
    ...(unlockedAt ? { unlockedAt } : {}),
    badges: unlocked
      ? uniqueById([...(args.previous.prestige?.badges ?? []), prestigeBadge])
      : (args.previous.prestige?.badges ?? []),
    titles: unlocked
      ? uniqueById([...(args.previous.prestige?.titles ?? []), prestigeTitle])
      : (args.previous.prestige?.titles ?? []),
    requirements,
  };
}

function selectTitle(args: {
  rules: OperatorTitleRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
  reputation: Reputation;
}) {
  const matched = [...args.rules]
    .sort((left, right) => right.priority - left.priority)
    .find((rule) => ruleMatches(rule, args.context));
  const selected =
    matched ?? DEFAULT_TITLE_RULES[DEFAULT_TITLE_RULES.length - 1];
  const previous = args.previous.titles[args.previous.titles.length - 1];

  if (previous?.id === selected.id) return previous;

  return {
    id: selected.id,
    name: selected.name,
    assignedAt: args.now,
    reason: selected.reason,
    reputationRank: args.reputation.rank,
    reputationScore: args.reputation.score,
  };
}

function deriveVictories(args: {
  rules: VictoryRule[];
  previous: LegacyHistory;
  context: LegacyRuleContext;
  now: string;
}) {
  const victories = [...args.previous.victories];
  for (const rule of args.rules) {
    if (victories.some((victory) => victory.id === rule.id)) continue;
    if (ruleMatches(rule, args.context)) {
      victories.push({
        id: rule.id,
        type: rule.type,
        title: rule.title,
        description: rule.description,
        rarity: rule.rarity,
        detectedAt: args.now,
      });
    }
  }
  return uniqueById(victories);
}

function calculateReputation(
  scores: Record<string, number>,
  weights: Record<string, number>,
  thresholds: ReputationThreshold[],
): Reputation {
  const totalWeight =
    Object.values(weights).reduce(
      (sum, weight) => sum + Math.max(0, weight),
      0,
    ) || 1;
  const weighted = Object.entries(weights).reduce(
    (sum, [metric, weight]) =>
      sum + clamp(scores[metric] ?? 0) * Math.max(0, weight),
    0,
  );
  const score = round(clamp(weighted / totalWeight));
  return {
    score,
    rank: rankFor(score, thresholds),
  };
}

function rankFor(score: number, thresholds: ReputationThreshold[]) {
  return thresholds.reduce(
    (rank, threshold) => (score >= threshold.minScore ? threshold.rank : rank),
    "Unknown" as ReputationRank,
  );
}

function conditionMatches(
  condition: LegacyCondition | undefined,
  context: LegacyRuleContext,
): boolean {
  if (!condition) return false;

  switch (condition.kind) {
    case "score":
      return compare(
        context.scores[condition.metric] ?? 0,
        condition.operator,
        condition.value,
      );
    case "counter":
      return compare(
        context.counters[condition.counter] ?? 0,
        condition.operator,
        condition.value,
      );
    case "flag":
      return condition.equals === undefined
        ? Boolean(context.flags[condition.flag])
        : context.flags[condition.flag] === condition.equals;
    case "achievement": {
      const unlocked = context.unlockedAchievementIds.has(condition.id);
      return condition.unlocked === false ? !unlocked : unlocked;
    }
    case "campaign":
      return context.campaigns.some(
        (campaign) =>
          campaign.id === condition.id && campaign.status === condition.status,
      );
    case "event": {
      const count = context.history.events.filter(
        (event) => event.type === condition.type,
      ).length;
      return count >= (condition.count ?? 1);
    }
    case "reputation":
      return compare(
        context.reputation.score,
        condition.operator,
        condition.value,
      );
    case "rank":
      return context.reputation.rank === condition.rank;
    case "all":
      return condition.conditions.every((child) =>
        conditionMatches(child, context),
      );
    case "any":
      return condition.conditions.some((child) =>
        conditionMatches(child, context),
      );
    case "not":
      return !conditionMatches(condition.condition, context);
    default:
      return false;
  }
}

function ruleMatches(
  rule: { condition?: LegacyCondition; evaluate?: LegacyRulePredicate },
  context: LegacyRuleContext,
) {
  return Boolean(
    rule.evaluate?.(context) || conditionMatches(rule.condition, context),
  );
}

function progressFromCondition(
  condition: LegacyCondition | undefined,
  context: LegacyRuleContext,
): number {
  if (!condition) return 0;
  if (condition.kind === "score")
    return progressAtLeast(context.scores[condition.metric], condition.value);
  if (condition.kind === "counter")
    return progressAtLeast(
      context.counters[condition.counter],
      condition.value,
    );
  if (condition.kind === "flag")
    return flagProgress(context.flags[condition.flag]);
  if (condition.kind === "achievement")
    return context.unlockedAchievementIds.has(condition.id) ? 100 : 0;
  if (condition.kind === "campaign")
    return context.campaigns.some(
      (campaign) =>
        campaign.id === condition.id && campaign.status === condition.status,
    )
      ? 100
      : 0;
  if (condition.kind === "event") {
    const count = context.history.events.filter(
      (event) => event.type === condition.type,
    ).length;
    return progressAtLeast(count, condition.count ?? 1);
  }
  if (condition.kind === "reputation")
    return progressAtLeast(context.reputation.score, condition.value);
  if (condition.kind === "rank")
    return context.reputation.rank === condition.rank ? 100 : 0;
  if (condition.kind === "all")
    return mean(
      condition.conditions.map((child) =>
        progressFromCondition(child, context),
      ),
    );
  if (condition.kind === "any")
    return maxProgress(
      ...condition.conditions.map((child) =>
        progressFromCondition(child, context),
      ),
    );
  if (condition.kind === "not")
    return conditionMatches(condition.condition, context) ? 0 : 100;
  return 0;
}

function applyLegacyEvent(
  history: LegacyHistory,
  event: LegacyEvent,
): LegacyHistory {
  const next = normalizeHistory({
    ...history,
    events: [...history.events, event],
  });

  if (event.type === "legacy.achievement.unlocked") {
    const achievement = event.payload.achievement as Achievement | undefined;
    if (achievement)
      next.achievements = uniqueById([...next.achievements, achievement]);
  }
  if (event.type === "legacy.badge.earned") {
    const badge = event.payload.badge as Badge | undefined;
    if (badge) next.badges = uniqueById([...next.badges, badge]);
  }
  if (event.type === "legacy.milestone.reached") {
    const milestone = event.payload.milestone as Milestone | undefined;
    if (milestone)
      next.milestones = uniqueById([...next.milestones, milestone]);
  }
  if (event.type === "legacy.unlock.granted") {
    const unlock = event.payload.unlock as Unlock | undefined;
    if (unlock) next.unlocks = uniqueById([...next.unlocks, unlock]);
  }
  if (event.type === "legacy.campaign.completed") {
    const campaign = event.payload.campaign as Campaign | undefined;
    if (campaign) next.campaigns = mergeCampaigns(next.campaigns, [campaign]);
  }
  if (event.type === "legacy.title.changed") {
    const title = event.payload.title as OperatorTitle | undefined;
    if (title)
      next.titles = [
        ...next.titles.filter((item) => item.id !== title.id),
        title,
      ];
  }
  if (event.type === "legacy.reputation.updated") {
    const reputation = event.payload.reputation as Reputation | undefined;
    if (reputation)
      next.reputation = [
        ...next.reputation,
        { ...reputation, updatedAt: event.timestamp },
      ];
  }
  if (event.type === "legacy.prestige.unlocked") {
    const prestige = event.payload.prestige as PrestigeState | undefined;
    if (prestige) next.prestige = prestige;
  }
  if (event.type === "legacy.victory.detected") {
    const victory = event.payload.victory as LegacyVictory | undefined;
    if (victory) next.victories = uniqueById([...next.victories, victory]);
  }

  return normalizeHistory(next);
}

function emitLegacyEvent(
  events: LegacyEvent[],
  existingKeys: Set<string>,
  type: LegacyEventType,
  timestamp: string,
  key: string,
  payload: Record<string, unknown>,
) {
  const idempotencyKey = `${type}:${key}`;
  if (existingKeys.has(idempotencyKey)) return;
  existingKeys.add(idempotencyKey);
  events.push({
    type,
    timestamp,
    idempotencyKey,
    payload,
  });
}

function normalizeHistory(
  history: Partial<LegacyHistory> | null | undefined,
): LegacyHistory {
  const base = history ?? {};
  return {
    achievements: uniqueById(
      (base.achievements ?? []).filter((achievement) => achievement.unlocked),
    ),
    badges: uniqueById(base.badges ?? []),
    milestones: uniqueById(base.milestones ?? []),
    unlocks: uniqueById(base.unlocks ?? []),
    campaigns: mergeCampaigns([], base.campaigns ?? []),
    titles: uniqueById(base.titles ?? []),
    reputation: base.reputation ?? [],
    prestige: base.prestige ?? null,
    victories: uniqueById(base.victories ?? []),
    events: uniqueByEventKey(base.events ?? []),
  };
}

function emptyHistory(): LegacyHistory {
  return {
    achievements: [],
    badges: [],
    milestones: [],
    unlocks: [],
    campaigns: [],
    titles: [],
    reputation: [],
    prestige: null,
    victories: [],
    events: [],
  };
}

function mergeCampaigns(left: Campaign[], right: Campaign[]) {
  const byId = new Map<string, Campaign>();
  for (const campaign of [...left, ...right]) {
    const existing = byId.get(campaign.id);
    if (!existing) {
      byId.set(campaign.id, campaign);
      continue;
    }
    if (existing.status === "completed") continue;
    if (campaign.status === "completed") {
      byId.set(campaign.id, {
        ...campaign,
        startedAt: existing.startedAt,
        completedAt: existing.completedAt ?? campaign.completedAt,
      });
      continue;
    }
    byId.set(campaign.id, {
      ...existing,
      ...campaign,
      startedAt: existing.startedAt,
    });
  }
  return Array.from(byId.values());
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function uniqueByEventKey(events: LegacyEvent[]): LegacyEvent[] {
  const byKey = new Map<string, LegacyEvent>();
  for (const event of events) {
    if (!byKey.has(event.idempotencyKey))
      byKey.set(event.idempotencyKey, event);
  }
  return Array.from(byKey.values());
}

function normalizeNumberRecord(
  record: Record<string, number | null | undefined> | undefined,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [
      key,
      clamp(numeric(value, 0)),
    ]),
  );
}

function normalizeThresholds(thresholds: ReputationThreshold[]) {
  return [...thresholds].sort((left, right) => left.minScore - right.minScore);
}

function compare(
  left: number,
  operator: LegacyComparisonOperator,
  right: number,
) {
  if (operator === ">=") return left >= right;
  if (operator === ">") return left > right;
  if (operator === "<=") return left <= right;
  if (operator === "<") return left < right;
  if (operator === "==") return left === right;
  return left !== right;
}

function progressAtLeast(value: unknown, target: number) {
  return clamp((numeric(value, 0) / Math.max(1, target)) * 100);
}

function flagProgress(value: unknown) {
  return value === true ? 100 : 0;
}

function flagValue(value: unknown) {
  return value === true ? 100 : 0;
}

function maxProgress(...values: number[]) {
  return clamp(Math.max(0, ...values.filter(Number.isFinite)));
}

function toIsoTimestamp(value: string | number | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string" && value.trim())
    return new Date(value).toISOString();
  return new Date().toISOString();
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
