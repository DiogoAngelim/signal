import { describe, expect, it } from "vitest";
import {
  type CommandCenterInput,
  buildCommandCenterViewModel,
  deriveAchievements,
  deriveBosses,
  deriveCampaign,
  deriveMissions,
  deriveOperatorIdentity,
  deriveOperatorLevel,
  deriveOperatorXp,
  deriveSkillTree,
  deriveWorldMap,
} from "./command-center";

const restorationProgress = {
  status: "collecting_evidence",
  restorationState: "watch",
  progressPct: 33,
  summary:
    "The recovery campaign remains active. Additional evidence is required before deployment authority is restored.",
  primaryBlocker: "Clean reduced-size outcomes are still pending.",
  gates: [
    {
      id: "survival-confidence",
      label: "Survival Confidence 70",
      passed: false,
      current: "65",
      target: "70",
      progressPct: 92,
      detail: "Survival confidence is below the restoration threshold.",
    },
    {
      id: "clean-reduced-size-outcomes",
      label: "3 Clean Outcomes",
      passed: false,
      current: "1",
      target: "3",
      progressPct: 33,
      detail: "Proof lane still needs clean outcomes.",
    },
  ],
  outcomeProof: {
    requiredCleanOutcomes: 3,
    cleanReducedSizeOutcomeCount: 1,
    activeProofBoundaryBreakCount: 0,
  },
} as any;

const baseInput: CommandCenterInput = {
  market: "US",
  operatorAction: "Wait",
  operatorSummary:
    "The system has not yet earned authorization to deploy capital at normal size.",
  participationMode: "limited",
  sizingMode: "small",
  trustScore: 80,
  survivalConfidence: 65,
  readinessScore: 60,
  historyDepthScore: 55,
  regimeCoverageScore: 62,
  sampleDiversityScore: 48,
  calibrationTrustworthiness: 85,
  knowledgeCompletenessScore: 78,
  dataReliabilityScore: 81,
  agencyMaturityScore: 74,
  memoryDepthScore: 55,
  discoveryScore: 71,
  recognitionScore: 88,
  judgementScore: 66,
  recoveryScore: 33,
  wisdomScore: 72,
  riskControlScore: 64,
  overfitRiskScore: 55,
  restorationProgress,
  cleanOutcomeCount: 1,
  requiredCleanOutcomeCount: 3,
  historicalMatches: 1313,
  hasSurvivalScar: true,
  topRestriction: {
    label: "Reduced-Size Deployment",
    explanation:
      "The recovery campaign remains active. Additional evidence is required before deployment authority is restored.",
    unlockCondition: "Complete recovery proof lane.",
  },
};

describe("command center derivation", () => {
  it("derives operator level and XP from maturity metrics", () => {
    const level = deriveOperatorLevel(baseInput);
    const xp = deriveOperatorXp(baseInput);

    expect(level.level).toBe(5);
    expect(level.title).toBe("Portfolio Commander");
    expect(level.nextTitle).toBe("Institutional Operator");
    expect(xp.current).toBeGreaterThan(450);
    expect(
      xp.sources.find((source) => source.label === "History Depth")?.xp,
    ).toBe(55);
    expect(
      xp.sources.find((source) => source.label === "Calibration")?.xp,
    ).toBe(85);
  });

  it("derives campaign progression, missions, bosses, and unlock cards", () => {
    const campaign = deriveCampaign(baseInput);
    const missions = deriveMissions(baseInput);
    const bosses = deriveBosses(baseInput);
    const model = buildCommandCenterViewModel(baseInput);

    expect(campaign.title).toBe("Restore Trading Authorization");
    expect(campaign.currentChapter).toBe("Watch");
    expect(campaign.path.map((step) => step.label)).toEqual([
      "Scarred",
      "Watch",
      "Limited",
      "Clear",
    ]);
    expect(missions.map((mission) => mission.id)).toEqual(
      expect.arrayContaining([
        "survival-confidence",
        "overfit-risk",
        "clean-outcomes",
        "data-reliability",
      ]),
    );
    expect(bosses.map((boss) => boss.name)).toContain("Overfit Hydra");
    expect(model.unlocks[0]?.currentLock).toBe("Normal Sizing Restoration");
  });

  it("derives skill tree states, world map regions, achievements, identity, and prestige", () => {
    const skills = deriveSkillTree(baseInput);
    const regions = deriveWorldMap(baseInput);
    const achievements = deriveAchievements(baseInput);
    const identity = deriveOperatorIdentity(baseInput);
    const model = buildCommandCenterViewModel({
      ...baseInput,
      trustScore: 98,
      survivalConfidence: 97,
      readinessScore: 97,
      historyDepthScore: 97,
      regimeCoverageScore: 97,
      calibrationTrustworthiness: 97,
      knowledgeCompletenessScore: 97,
      dataReliabilityScore: 100,
      agencyMaturityScore: 97,
      recoveryScore: 100,
      wisdomScore: 97,
      governanceApproved: true,
      restorationProgress: {
        ...restorationProgress,
        status: "restored",
        restorationState: "clear",
        progressPct: 100,
      } as any,
    });

    expect(skills.find((skill) => skill.label === "Trust")?.state).toBe(
      "Mature",
    );
    expect(skills.find((skill) => skill.label === "Recognition")?.state).toBe(
      "Mature",
    );
    expect(regions.map((region) => region.label)).toContain("Recovery Region");
    expect(
      achievements.find(
        (achievement) => achievement.id === "first-clean-outcome",
      )?.unlocked,
    ).toBe(true);
    expect(identity.className).toBe("Probe Operator");
    expect(model.prestige.tier).toBe("Prestige III");
    expect(model.operatorClass).toBe("Institutional Operator");
    expect(model.reputation.rank).toBe("Institutional");
    expect(model.badges.map((badge) => badge.id)).toContain(
      "institutional-operator",
    );
    expect(model.campaignHistory.map((campaign) => campaign.name)).toContain(
      "Restore Trading Authorization",
    );
    expect(model.unlockHistory.map((unlock) => unlock.id)).toContain(
      "prestige-eligibility",
    );
  });
});
