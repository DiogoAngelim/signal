import type {
  ReadinessRemediationDiagnostic,
  RecoveryDiagnostic,
  RestorationProgressDiagnostic,
  TrustGovernorDiagnostic,
} from "@/lib/api";
import {
  DEFAULT_CAMPAIGN_RULES,
  type LegacyEvent,
  type LegacyHistory,
  type LegacyOutput,
  evaluateLegacy,
} from "../../../signal-framework/legacy/engine";

export type CommandCenterTone = "good" | "warn" | "bad" | "neutral";

export type CommandCenterSkillState =
  | "Locked"
  | "Growing"
  | "Mature"
  | "Mastered";

export type CommandCenterRequirement = {
  label: string;
  passed: boolean;
};

export type CommandCenterInput = {
  market?: string;
  strategyState?: string;
  operatorAction?: string;
  operatorSummary?: string;
  finalDecision?: string;
  sizingMode?: string;
  participationMode?: string;
  exposurePct?: number | null;
  topRestriction?: {
    label?: string | null;
    explanation?: string | null;
    unlockCondition?: string | null;
    invalidationCondition?: string | null;
  } | null;
  trustScore?: number | null;
  survivalConfidence?: number | null;
  readinessScore?: number | null;
  historyDepthScore?: number | null;
  historyCoverageYears?: number | null;
  regimeCoverageScore?: number | null;
  sampleDiversityScore?: number | null;
  calibrationTrustworthiness?: number | null;
  calibrationSampleSize?: number | null;
  knowledgeCompletenessScore?: number | null;
  dataReliabilityScore?: number | null;
  agencyMaturityScore?: number | null;
  memoryDepthScore?: number | null;
  discoveryScore?: number | null;
  recognitionScore?: number | null;
  judgementScore?: number | null;
  recoveryScore?: number | null;
  wisdomScore?: number | null;
  riskControlScore?: number | null;
  overfitRiskScore?: number | null;
  restorationProgress?: RestorationProgressDiagnostic | null;
  recovery?: RecoveryDiagnostic | null;
  trustGovernor?: TrustGovernorDiagnostic | null;
  readinessRemediation?: ReadinessRemediationDiagnostic | null;
  activeRestrictions?: Array<{
    code?: string | null;
    label?: string | null;
    explanation?: string | null;
    unlockCondition?: string | null;
    progressPct?: number | null;
  }>;
  unlockConditions?: string[];
  invalidationConditions?: string[];
  nextActions?: string[];
  cleanOutcomeCount?: number | null;
  requiredCleanOutcomeCount?: number | null;
  activeBoundaryBreakCount?: number | null;
  historicalMatches?: number | null;
  normalSizingRestored?: boolean;
  governanceApproved?: boolean;
  hasSurvivalScar?: boolean;
  legacyHistory?: Partial<LegacyHistory> | null;
  legacyEvents?: LegacyEvent[];
  legacyNow?: string | number | Date;
};

export type CommandCenterLevel = {
  level: number;
  title: string;
  score: number;
  nextTitle: string | null;
  progressToNextPct: number;
};

export type CommandCenterXpSource = {
  label: string;
  xp: number;
  value: number;
};

export type CommandCenterXp = {
  current: number;
  nextRank: string | null;
  nextRankXp: number | null;
  progressToNextPct: number;
  sources: CommandCenterXpSource[];
};

export type CommandCenterCampaign = {
  title: string;
  currentChapter: string;
  progressPct: number;
  path: Array<{
    id: string;
    label: string;
    passed: boolean;
    active: boolean;
  }>;
  summary: string;
};

export type CommandCenterMission = {
  id: string;
  label: string;
  current: string;
  target: string;
  progressPct: number;
  reward: string;
  tone: CommandCenterTone;
};

export type CommandCenterBoss = {
  id: string;
  name: string;
  threatLevel: "Low" | "Medium" | "High" | "Critical";
  strengthPct: number;
  defeatCondition: string;
  progressPct: number;
};

export type CommandCenterSkill = {
  id: string;
  label: string;
  state: CommandCenterSkillState;
  score: number | null;
};

export type CommandCenterRegion = {
  id: string;
  label: string;
  completionPct: number;
  status: string;
  tone: CommandCenterTone;
};

export type CommandCenterAchievement = {
  id: string;
  label: string;
  description: string;
  unlocked: boolean;
  progressPct: number;
  rarity: string;
  unlockedAt?: string;
};

export type CommandCenterBadge = {
  id: string;
  name: string;
  tier: string;
  earnedAt: string;
};

export type CommandCenterStreak = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type CommandCenterUnlockCard = {
  id: string;
  currentLock: string;
  requirements: CommandCenterRequirement[];
  progressPct: number;
  reward: string;
};

export type CommandCenterAdvisor = {
  assessment: string;
  threats: string[];
  recommendations: string[];
  nextObjective: string;
  campaignStatus: string;
};

export type CommandCenterProgressMetric = {
  id: string;
  label: string;
  value: number;
};

export type CommandCenterPrestige = {
  enabled: boolean;
  tier: string;
  title: string;
  progressPct: number;
  requirement: string;
  level: number;
  badges: CommandCenterBadge[];
};

export type CommandCenterCampaignHistoryItem = {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  completedAt?: string;
};

export type CommandCenterMilestoneHistoryItem = {
  id: string;
  name: string;
  reachedAt: string;
  source: string;
  value: number;
};

export type CommandCenterUnlockHistoryItem = {
  id: string;
  name: string;
  unlockedAt: string;
  source: string;
};

export type CommandCenterReputation = {
  score: number;
  rank: string;
};

export type CommandCenterViewModel = {
  market: string;
  operatorClass: string;
  operatorMode: string;
  reputation: CommandCenterReputation;
  level: CommandCenterLevel;
  xp: CommandCenterXp;
  campaign: CommandCenterCampaign;
  missions: CommandCenterMission[];
  bosses: CommandCenterBoss[];
  skills: CommandCenterSkill[];
  regions: CommandCenterRegion[];
  achievements: CommandCenterAchievement[];
  badges: CommandCenterBadge[];
  campaignHistory: CommandCenterCampaignHistoryItem[];
  milestones: CommandCenterMilestoneHistoryItem[];
  unlockHistory: CommandCenterUnlockHistoryItem[];
  streaks: CommandCenterStreak[];
  unlocks: CommandCenterUnlockCard[];
  advisor: CommandCenterAdvisor;
  prestige: CommandCenterPrestige;
  progressMetrics: CommandCenterProgressMetric[];
  legacy: LegacyOutput;
};

const RANKS = [
  "Observer",
  "Scout",
  "Analyst",
  "Strategist",
  "Portfolio Commander",
  "Institutional Operator",
  "Market Architect",
  "System Governor",
];

const LEVEL_THRESHOLDS = [0, 18, 32, 46, 60, 72, 84, 94];
const XP_THRESHOLDS = [0, 100, 220, 360, 520, 700, 900, 1120];

function finiteNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizePercent(value: unknown) {
  const number = finiteNumber(value);
  if (number == null) return null;
  if (number >= 0 && number <= 1) return clamp(number * 100);
  return clamp(number);
}

function scoreFromYears(years?: number | null) {
  const value = finiteNumber(years);
  if (value == null) return null;
  return clamp((value / 10) * 100);
}

function scoreFromMatches(matches?: number | null) {
  const value = finiteNumber(matches);
  if (value == null) return null;
  return clamp((value / 10_000) * 100);
}

function averageScore(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => value != null);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function displayPct(value: number | null | undefined) {
  return value == null ? "Pending" : `${Math.round(value)}%`;
}

function toneForProgress(value: number | null | undefined): CommandCenterTone {
  if (value == null) return "neutral";
  if (value >= 75) return "good";
  if (value >= 45) return "warn";
  return "bad";
}

function toneForMission(progressPct: number): CommandCenterTone {
  if (progressPct >= 100) return "good";
  if (progressPct >= 55) return "warn";
  return "bad";
}

function skillState(score: number | null | undefined): CommandCenterSkillState {
  if (score == null || score < 20) return "Locked";
  if (score >= 90) return "Mastered";
  if (score >= 70) return "Mature";
  return "Growing";
}

function threatLevel(strengthPct: number): CommandCenterBoss["threatLevel"] {
  if (strengthPct >= 80) return "Critical";
  if (strengthPct >= 60) return "High";
  if (strengthPct >= 35) return "Medium";
  return "Low";
}

function stateLabel(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "Pending";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => String(value ?? "").trim())?.trim() ?? "";
}

function derivedScores(input: CommandCenterInput) {
  const restoration = input.restorationProgress;
  const survival = normalizePercent(
    input.survivalConfidence ??
      restoration?.gates?.find((gate) => gate.id === "survival-confidence")
        ?.progressPct,
  );
  const readiness = normalizePercent(input.readinessScore);
  const historyDepth =
    normalizePercent(input.historyDepthScore) ??
    scoreFromYears(input.historyCoverageYears);
  const regime = normalizePercent(input.regimeCoverageScore);
  const sampleDiversity = normalizePercent(input.sampleDiversityScore);
  const calibration = normalizePercent(input.calibrationTrustworthiness);
  const discovery = normalizePercent(input.discoveryScore);
  const recognition = normalizePercent(input.recognitionScore);
  const judgement = normalizePercent(input.judgementScore);
  const recovery =
    normalizePercent(input.recoveryScore) ??
    normalizePercent(restoration?.progressPct) ??
    normalizePercent(input.recovery?.recoveryScore);
  const wisdom = normalizePercent(input.wisdomScore);
  const trust =
    normalizePercent(input.trustScore) ??
    normalizePercent(input.trustGovernor?.trustScore);
  const dataReliability = normalizePercent(input.dataReliabilityScore);
  const agencyMaturity =
    normalizePercent(input.agencyMaturityScore) ??
    averageScore([trust, dataReliability, calibration]);
  const memoryDepth =
    normalizePercent(input.memoryDepthScore) ??
    scoreFromMatches(input.historicalMatches) ??
    historyDepth;
  const knowledge =
    normalizePercent(input.knowledgeCompletenessScore) ??
    averageScore([discovery, recognition, wisdom, memoryDepth]);
  const riskControl =
    normalizePercent(input.riskControlScore) ??
    (normalizePercent(input.overfitRiskScore) == null
      ? null
      : 100 - normalizePercent(input.overfitRiskScore)!);
  const overfit = normalizePercent(input.overfitRiskScore);

  return {
    trust,
    survival,
    readiness,
    historyDepth,
    regime,
    sampleDiversity,
    calibration,
    discovery,
    recognition,
    judgement,
    recovery,
    wisdom,
    dataReliability,
    agencyMaturity,
    memoryDepth,
    knowledge,
    riskControl,
    overfit,
  };
}

export function deriveLegacy(input: CommandCenterInput): LegacyOutput {
  const scores = derivedScores(input);
  const governanceScore = input.governanceApproved
    ? 100
    : averageScore([
        scores.trust,
        scores.readiness,
        input.trustGovernor?.allowsNewExposure ? 80 : null,
      ]);
  const cleanOutcomeCount =
    finiteNumber(input.cleanOutcomeCount) ??
    finiteNumber(
      input.restorationProgress?.outcomeProof?.cleanReducedSizeOutcomeCount,
    );
  const normalSizingRestored =
    Boolean(input.normalSizingRestored) ||
    input.recovery?.canRestoreSizing === true ||
    input.restorationProgress?.canRestoreSizing === true;

  return evaluateLegacy({
    now: input.legacyNow,
    history: input.legacyHistory,
    eventLog: input.legacyEvents,
    scores: {
      trust: scores.trust,
      recovery: scores.recovery,
      governance: governanceScore,
      survival: scores.survival,
      agency: scores.agencyMaturity,
      wisdom: scores.wisdom,
      discovery: scores.discovery,
      recognition: scores.recognition,
      judgement: scores.judgement,
      readiness: scores.readiness,
      riskControl: scores.riskControl,
      dataReliability: scores.dataReliability,
      memoryDepth: scores.memoryDepth,
    },
    counters: {
      cleanOutcomeCount,
      historicalMatches: finiteNumber(input.historicalMatches),
    },
    flags: {
      normalSizingRestored,
      governanceApproved: Boolean(input.governanceApproved),
      recoveryComplete:
        input.recovery?.status === "restored" ||
        input.restorationProgress?.status === "restored" ||
        String(input.restorationProgress?.restorationState ?? "") === "clear",
      hasSurvivalScar: Boolean(input.hasSurvivalScar),
      newExposureAuthorized: input.trustGovernor?.allowsNewExposure === true,
    },
    config: {
      campaigns: DEFAULT_CAMPAIGN_RULES.map((campaign) =>
        campaign.id === "restore-operating-authorization"
          ? { ...campaign, name: "Restore Trading Authorization" }
          : campaign,
      ),
    },
  });
}

export function deriveOperatorLevel(
  input: CommandCenterInput,
): CommandCenterLevel {
  const scores = derivedScores(input);
  const maturityScore =
    averageScore([
      scores.trust,
      scores.survival,
      scores.readiness,
      scores.historyDepth,
      scores.calibration,
      scores.knowledge,
      scores.regime,
    ]) ?? 0;
  const levelIndex = LEVEL_THRESHOLDS.reduce(
    (current, threshold, index) =>
      maturityScore >= threshold ? index : current,
    0,
  );
  const nextThreshold = LEVEL_THRESHOLDS[levelIndex + 1] ?? null;
  const currentThreshold = LEVEL_THRESHOLDS[levelIndex] ?? 0;
  const progressToNextPct =
    nextThreshold == null
      ? 100
      : clamp(
          ((maturityScore - currentThreshold) /
            Math.max(1, nextThreshold - currentThreshold)) *
            100,
        );

  return {
    level: levelIndex + 1,
    title: RANKS[levelIndex],
    score: Math.round(maturityScore),
    nextTitle: RANKS[levelIndex + 1] ?? null,
    progressToNextPct,
  };
}

export function deriveOperatorXp(input: CommandCenterInput): CommandCenterXp {
  const scores = derivedScores(input);
  const sources: CommandCenterXpSource[] = [
    ["History Depth", scores.historyDepth, 1],
    ["Regime Coverage", scores.regime, 1],
    ["Sample Diversity", scores.sampleDiversity, 0.8],
    ["Calibration", scores.calibration, 1],
    ["Knowledge Completeness", scores.knowledge, 1],
    ["Data Reliability", scores.dataReliability, 0.8],
    ["Agency Maturity", scores.agencyMaturity, 0.8],
    ["Memory Depth", scores.memoryDepth, 0.7],
  ].map(([label, value, weight]) => {
    const normalized = value == null ? 0 : Number(value);
    return {
      label: String(label),
      xp: Math.round(normalized * Number(weight)),
      value: Math.round(normalized),
    };
  });
  const current = sources.reduce((sum, source) => sum + source.xp, 0);
  const currentIndex = XP_THRESHOLDS.reduce(
    (index, threshold, thresholdIndex) =>
      current >= threshold ? thresholdIndex : index,
    0,
  );
  const nextRankXp = XP_THRESHOLDS[currentIndex + 1] ?? null;
  const previousRankXp = XP_THRESHOLDS[currentIndex] ?? 0;
  const progressToNextPct =
    nextRankXp == null
      ? 100
      : clamp(
          ((current - previousRankXp) / (nextRankXp - previousRankXp)) * 100,
        );

  return {
    current,
    nextRank: RANKS[currentIndex + 1] ?? null,
    nextRankXp,
    progressToNextPct,
    sources,
  };
}

export function deriveCampaign(
  input: CommandCenterInput,
): CommandCenterCampaign {
  const restoration = input.restorationProgress;
  const currentState =
    restoration?.restorationState ??
    (input.recovery?.status === "restored"
      ? "clear"
      : input.recovery?.mode === "graduated"
        ? "limited"
        : input.recovery?.mode === "reduced-size"
          ? "watch"
          : "scarred");
  const progressPct = normalizePercent(restoration?.progressPct) ?? 0;
  const order = ["scarred", "watch", "limited", "clear"];
  const currentIndex = Math.max(0, order.indexOf(currentState));
  const path = order.map((id, index) => ({
    id,
    label: stateLabel(id),
    passed: index < currentIndex || currentState === "clear",
    active: index === currentIndex,
  }));
  const summary = firstText(
    restoration?.summary,
    input.recovery?.reasons?.[0],
    "Restore deployment authorization through survival proof, trust, and clean reduced-size outcomes.",
  );

  return {
    title: "Restore Trading Authorization",
    currentChapter: stateLabel(currentState),
    progressPct,
    path,
    summary,
  };
}

function missionProgressAtLeast(current: number | null, target: number) {
  if (current == null) return 0;
  return clamp((current / target) * 100);
}

function missionProgressAtMost(current: number | null, target: number) {
  if (current == null) return 0;
  return current <= target
    ? 100
    : clamp(((100 - current) / Math.max(1, 100 - target)) * 100);
}

export function deriveMissions(
  input: CommandCenterInput,
): CommandCenterMission[] {
  const scores = derivedScores(input);
  const restoration = input.restorationProgress;
  const cleanCount =
    finiteNumber(input.cleanOutcomeCount) ??
    finiteNumber(restoration?.outcomeProof?.cleanReducedSizeOutcomeCount);
  const requiredClean =
    finiteNumber(input.requiredCleanOutcomeCount) ??
    finiteNumber(restoration?.outcomeProof?.requiredCleanOutcomes);
  const missions: CommandCenterMission[] = [];

  const addMission = (
    mission: Omit<CommandCenterMission, "tone">,
    include: boolean,
  ) => {
    if (!include) return;
    missions.push({
      ...mission,
      tone: toneForMission(mission.progressPct),
    });
  };

  addMission(
    {
      id: "survival-confidence",
      label: "Raise Survival Confidence to 70",
      current: displayPct(scores.survival),
      target: "70%",
      progressPct: missionProgressAtLeast(scores.survival, 70),
      reward: "Normal-sizing restoration review",
    },
    scores.survival == null || scores.survival < 70,
  );
  addMission(
    {
      id: "overfit-risk",
      label: "Reduce Overfit Risk below 30",
      current: displayPct(scores.overfit),
      target: "<=30%",
      progressPct: missionProgressAtMost(scores.overfit, 30),
      reward: "Robustness gate relief",
    },
    scores.overfit != null && scores.overfit > 30,
  );
  addMission(
    {
      id: "clean-outcomes",
      label: `Complete ${requiredClean ?? 3} Clean Outcomes`,
      current:
        cleanCount == null || requiredClean == null
          ? "Pending"
          : `${cleanCount}/${requiredClean}`,
      target: String(requiredClean ?? 3),
      progressPct:
        cleanCount == null || requiredClean == null
          ? 0
          : clamp((cleanCount / Math.max(1, requiredClean)) * 100),
      reward: "Recovery proof lane advancement",
    },
    requiredClean != null && (cleanCount ?? 0) < requiredClean,
  );
  addMission(
    {
      id: "trust-threshold",
      label: "Restore Trust Threshold",
      current: displayPct(scores.trust),
      target: "70%",
      progressPct: missionProgressAtLeast(scores.trust, 70),
      reward: "Governance authorization",
    },
    scores.trust == null || scores.trust < 70,
  );
  addMission(
    {
      id: "calibration",
      label: "Lift Calibration Reliability to 70",
      current: displayPct(scores.calibration),
      target: "70%",
      progressPct: missionProgressAtLeast(scores.calibration, 70),
      reward: "Confidence cap lift",
    },
    scores.calibration == null || scores.calibration < 70,
  );
  addMission(
    {
      id: "data-reliability",
      label: "Harden Data Reliability to 95",
      current: displayPct(scores.dataReliability),
      target: "95%",
      progressPct: missionProgressAtLeast(scores.dataReliability, 95),
      reward: "Data Guardian readiness",
    },
    scores.dataReliability != null && scores.dataReliability < 95,
  );

  if (!missions.length) {
    missions.push({
      id: "maintain-authority",
      label: "Maintain Deployment Authority",
      current: "Clear",
      target: "Hold",
      progressPct: 100,
      reward: "Prestige eligibility",
      tone: "good",
    });
  }

  return missions.slice(0, 6);
}

export function deriveBosses(input: CommandCenterInput): CommandCenterBoss[] {
  const scores = derivedScores(input);
  const restorationProgress =
    normalizePercent(input.restorationProgress?.progressPct) ?? scores.recovery;
  const bosses: CommandCenterBoss[] = [];

  if (scores.overfit != null && scores.overfit > 30) {
    bosses.push({
      id: "overfit-hydra",
      name: "Overfit Hydra",
      threatLevel: threatLevel(scores.overfit),
      strengthPct: Math.round(scores.overfit),
      defeatCondition: "<=30% overfit risk",
      progressPct: missionProgressAtMost(scores.overfit, 30),
    });
  }

  if (
    (scores.survival != null && scores.survival < 70) ||
    input.hasSurvivalScar ||
    ["scarred", "watch", "limited"].includes(
      String(input.restorationProgress?.restorationState ?? ""),
    )
  ) {
    const strength = scores.survival == null ? 65 : 100 - scores.survival;
    bosses.push({
      id: "survival-memory-scar",
      name: "Survival Memory Scar",
      threatLevel: threatLevel(strength),
      strengthPct: Math.round(clamp(strength)),
      defeatCondition: "Survival confidence >=70 with clean proof",
      progressPct: missionProgressAtLeast(scores.survival, 70),
    });
  }

  if (restorationProgress != null && restorationProgress < 100) {
    bosses.push({
      id: "recovery-gate",
      name: "Recovery Gate",
      threatLevel: threatLevel(100 - restorationProgress),
      strengthPct: Math.round(100 - restorationProgress),
      defeatCondition: "Campaign reaches Clear",
      progressPct: restorationProgress,
    });
  }

  if (scores.trust != null && scores.trust < 70) {
    bosses.push({
      id: "trust-gate",
      name: "Trust Gate",
      threatLevel: threatLevel(100 - scores.trust),
      strengthPct: Math.round(100 - scores.trust),
      defeatCondition: "Trust >=70",
      progressPct: missionProgressAtLeast(scores.trust, 70),
    });
  }

  if (scores.readiness != null && scores.readiness < 70) {
    bosses.push({
      id: "readiness-gate",
      name: "Readiness Gate",
      threatLevel: threatLevel(100 - scores.readiness),
      strengthPct: Math.round(100 - scores.readiness),
      defeatCondition: "Readiness >=70",
      progressPct: missionProgressAtLeast(scores.readiness, 70),
    });
  }

  return bosses.slice(0, 5);
}

export function deriveSkillTree(
  input: CommandCenterInput,
): CommandCenterSkill[] {
  const scores = derivedScores(input);
  const reflection = averageScore([
    scores.calibration,
    scores.wisdom,
    scores.sampleDiversity,
  ]);

  return [
    ["survival", "Survival", scores.survival],
    ["trust", "Trust", scores.trust],
    ["discovery", "Discovery", scores.discovery],
    ["recognition", "Recognition", scores.recognition],
    ["judgement", "Judgement", scores.judgement],
    ["agency", "Agency", scores.agencyMaturity],
    ["recovery", "Recovery", scores.recovery],
    ["reflection", "Reflection", reflection],
    ["wisdom", "Wisdom", scores.wisdom],
  ].map(([id, label, score]) => ({
    id: String(id),
    label: String(label),
    score: score == null ? null : Math.round(Number(score)),
    state: skillState(score as number | null),
  }));
}

export function deriveWorldMap(
  input: CommandCenterInput,
): CommandCenterRegion[] {
  const scores = derivedScores(input);
  const execution = averageScore([
    scores.readiness,
    scores.riskControl,
    scores.overfit == null ? null : 100 - scores.overfit,
  ]);
  const governance = averageScore([
    scores.trust,
    scores.readiness,
    input.governanceApproved ? 100 : null,
  ]);
  const regions = [
    ["recovery", "Recovery Region", scores.recovery],
    ["trust", "Trust Region", scores.trust],
    [
      "discovery",
      "Discovery Region",
      averageScore([scores.discovery, scores.regime, scores.knowledge]),
    ],
    ["execution", "Execution Region", execution],
    ["governance", "Governance Region", governance],
    [
      "memory",
      "Institutional Memory Region",
      averageScore([
        scores.historyDepth,
        scores.memoryDepth,
        scores.sampleDiversity,
      ]),
    ],
  ];

  return regions.map(([id, label, score]) => {
    const completionPct = Math.round(score == null ? 0 : Number(score));
    return {
      id: String(id),
      label: String(label),
      completionPct,
      status:
        completionPct >= 90
          ? "Secured"
          : completionPct >= 70
            ? "Established"
            : completionPct >= 35
              ? "Contested"
              : "Unmapped",
      tone: toneForProgress(score as number | null),
    };
  });
}

export function deriveAchievements(
  input: CommandCenterInput,
  legacy = deriveLegacy(input),
): CommandCenterAchievement[] {
  return legacy.achievements.map((achievement) => ({
    id: achievement.id,
    label: achievement.name,
    description: achievement.description,
    unlocked: achievement.unlocked,
    progressPct: achievement.progressPct,
    rarity: achievement.rarity,
    unlockedAt: achievement.unlockedAt,
  }));
}

function deriveStreaks(input: CommandCenterInput): CommandCenterStreak[] {
  const cleanCount =
    finiteNumber(input.cleanOutcomeCount) ??
    finiteNumber(
      input.restorationProgress?.outcomeProof?.cleanReducedSizeOutcomeCount,
    );
  const activeBreaks =
    finiteNumber(input.activeBoundaryBreakCount) ??
    finiteNumber(
      input.restorationProgress?.outcomeProof?.activeProofBoundaryBreakCount,
    );
  const streaks: CommandCenterStreak[] = [];

  if (cleanCount != null) {
    streaks.push({
      id: "clean-outcome",
      label: "Clean Outcome Streak",
      value: String(cleanCount),
      detail: "Reduced-size outcomes without active proof breaks",
    });
  }

  if (activeBreaks != null) {
    streaks.push({
      id: "recovery-breaks",
      label: "Recovery Streak",
      value: activeBreaks === 0 ? "Intact" : `${activeBreaks} breaks`,
      detail: "Proof lane boundary discipline",
    });
  }

  return streaks;
}

function deriveOperatorMode(input: CommandCenterInput) {
  const mode = String(
    input.participationMode ?? input.sizingMode ?? input.operatorAction ?? "",
  ).toLowerCase();

  if (/observe/.test(mode)) return "Observe";
  if (/wait|watch|paper|none|hold/.test(mode)) {
    return "Wait";
  }
  if (/exit|defensive|blocked/.test(mode)) {
    return "Exits Only";
  }
  if (/reduced|limited|micro|small|graduated|probe/.test(mode)) {
    return "Reduced Size";
  }
  if (/normal|active|approved|full|large|maxsafe/.test(mode)) {
    return "Normal Participation";
  }

  return "Observe";
}

export function deriveOperatorIdentity(
  input: CommandCenterInput,
  legacy = deriveLegacy(input),
) {
  return {
    className: legacy.title.name,
    mode: deriveOperatorMode(input),
  };
}

function deriveUnlockCards(
  input: CommandCenterInput,
): CommandCenterUnlockCard[] {
  const scores = derivedScores(input);
  const cards: CommandCenterUnlockCard[] = [];
  const restoration = input.restorationProgress;

  if (restoration?.gates?.length) {
    cards.push({
      id: "normal-sizing-restoration",
      currentLock: "Normal Sizing Restoration",
      requirements: restoration.gates.slice(0, 5).map((gate) => ({
        label: gate.label,
        passed: gate.passed,
      })),
      progressPct: normalizePercent(restoration.progressPct) ?? 0,
      reward: "Normal deployment authority",
    });
  }

  if (input.trustGovernor?.blockers?.length || (scores.trust ?? 100) < 70) {
    const requirements = input.trustGovernor?.unlockCriteria?.length
      ? input.trustGovernor.unlockCriteria.slice(0, 4).map((label) => ({
          label,
          passed: false,
        }))
      : [
          {
            label: "Trust >=70",
            passed: (scores.trust ?? 0) >= 70,
          },
        ];

    cards.push({
      id: "trust-governor",
      currentLock: "Trust Governor Authorization",
      requirements,
      progressPct: missionProgressAtLeast(scores.trust, 70),
      reward: "New exposure authorization",
    });
  }

  if (input.topRestriction?.label) {
    cards.push({
      id: "primary-restriction",
      currentLock: input.topRestriction.label,
      requirements: [
        {
          label:
            input.topRestriction.unlockCondition ??
            "Maintain trust, safety, reliability, and opportunity thresholds.",
          passed: false,
        },
      ],
      progressPct:
        averageScore([scores.trust, scores.survival, scores.readiness]) ?? 0,
      reward: "Expanded operator access",
    });
  }

  if (input.readinessRemediation?.steps?.length) {
    cards.push({
      id: "readiness-remediation",
      currentLock: "Readiness Remediation",
      requirements: input.readinessRemediation.steps
        .slice(0, 4)
        .map((step) => ({
          label: step.title,
          passed: step.status === "done",
        })),
      progressPct: scores.readiness ?? 0,
      reward: "Production readiness lift",
    });
  }

  return cards.slice(0, 4);
}

function deriveAdvisor(
  input: CommandCenterInput,
  campaign: CommandCenterCampaign,
  missions: CommandCenterMission[],
  bosses: CommandCenterBoss[],
): CommandCenterAdvisor {
  const assessment = firstText(
    input.operatorSummary,
    input.topRestriction?.explanation,
    "The system is translating evidence into deployment authority without changing the trading decision.",
  );
  const threats = bosses.length
    ? bosses.map((boss) => `${boss.name}: ${boss.defeatCondition}`)
    : ["No major restriction boss is active."];
  const recommendations = missions
    .slice(0, 3)
    .map((mission) => `${mission.label} to unlock ${mission.reward}.`);

  return {
    assessment,
    threats,
    recommendations,
    nextObjective: missions[0]?.label ?? "Maintain command discipline",
    campaignStatus: `${campaign.title}: ${campaign.currentChapter}`,
  };
}

function derivePrestige(
  input: CommandCenterInput,
  legacy = deriveLegacy(input),
): CommandCenterPrestige {
  const progressPct = legacy.prestige.requirements.length
    ? Math.min(
        ...legacy.prestige.requirements.map(
          (requirement) => requirement.current,
        ),
      )
    : 0;
  const title =
    legacy.prestige.titles[legacy.prestige.titles.length - 1]?.name ??
    legacy.title.name;

  return {
    enabled: legacy.prestige.unlocked,
    tier: legacy.prestige.unlocked
      ? `Prestige ${romanNumeral(Math.max(1, legacy.prestige.level))}`
      : "Prestige Locked",
    title: legacy.prestige.unlocked ? title : "Maturity categories incomplete",
    progressPct: Math.round(progressPct),
    requirement: "Trust, recovery, governance, wisdom, and agency at 80+",
    level: legacy.prestige.level,
    badges: legacy.prestige.badges.map((badge) => ({
      id: badge.id,
      name: badge.name,
      tier: badge.tier,
      earnedAt: badge.earnedAt,
    })),
  };
}

function romanNumeral(value: number) {
  if (value >= 3) return "III";
  if (value === 2) return "II";
  return "I";
}

export function buildCommandCenterViewModel(
  input: CommandCenterInput,
): CommandCenterViewModel {
  const legacy = deriveLegacy(input);
  const level = deriveOperatorLevel(input);
  const xp = deriveOperatorXp(input);
  const campaign = deriveCampaign(input);
  const missions = deriveMissions(input);
  const bosses = deriveBosses(input);
  const identity = deriveOperatorIdentity(input, legacy);
  const scores = derivedScores(input);

  return {
    market: input.market || "Market",
    operatorClass: identity.className,
    operatorMode: identity.mode,
    reputation: legacy.reputation,
    level,
    xp,
    campaign,
    missions,
    bosses,
    skills: deriveSkillTree(input),
    regions: deriveWorldMap(input),
    achievements: deriveAchievements(input, legacy),
    badges: legacy.badges.map((badge) => ({
      id: badge.id,
      name: badge.name,
      tier: badge.tier,
      earnedAt: badge.earnedAt,
    })),
    campaignHistory: legacy.campaigns.map((campaignItem) => ({
      id: campaignItem.id,
      name: campaignItem.name,
      status: stateLabel(campaignItem.status),
      startedAt: campaignItem.startedAt,
      completedAt: campaignItem.completedAt,
    })),
    milestones: legacy.milestones.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      reachedAt: milestone.reachedAt,
      source: stateLabel(milestone.source),
      value: milestone.value,
    })),
    unlockHistory: legacy.unlocks.map((unlock) => ({
      id: unlock.id,
      name: unlock.name,
      unlockedAt: unlock.unlockedAt,
      source: stateLabel(unlock.source),
    })),
    streaks: deriveStreaks(input),
    unlocks: deriveUnlockCards(input),
    advisor: deriveAdvisor(input, campaign, missions, bosses),
    prestige: derivePrestige(input, legacy),
    progressMetrics: [
      ["legacy", "Legacy Progress", legacy.score],
      ["recovery", "Recovery Progress", scores.recovery],
      ["trust", "Trust Progress", scores.trust],
      ["calibration", "Calibration Progress", scores.calibration],
      ["readiness", "Readiness Progress", scores.readiness],
    ]
      .filter(([, , value]) => value != null)
      .map(([id, label, value]) => ({
        id: String(id),
        label: String(label),
        value: Math.round(Number(value)),
      })),
    legacy,
  };
}
