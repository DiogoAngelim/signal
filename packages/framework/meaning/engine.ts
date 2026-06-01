import { clamp, mean } from "../math/statistics";

export const HUMAN_NEEDS = [
  "survival",
  "safety",
  "security",
  "stability",
  "relief",
  "control",
  "autonomy",
  "freedom",
  "growth",
  "mastery",
  "achievement",
  "esteem",
  "belonging",
  "identity",
  "purpose",
  "peace",
  "excitement",
  "recovery",
  "contribution",
  "meaning",
] as const;

export type HumanNeed = (typeof HUMAN_NEEDS)[number];

export type MeaningInput = {
  text: string;
  context?: {
    domain?: string;
    currentGoal?: string;
    safetyConstraints?: string[];
    evidence?: string[];
  };
};

export type MeaningGravityLabel =
  | "destructive"
  | "strongly-negative"
  | "risky"
  | "neutral"
  | "constructive"
  | "deeply-constructive";

export type MeaningActionPermission = "allow" | "reduce" | "review" | "block";

export type MeaningPurposeContext = {
  desiredFuture: string;
  primaryNeed: HumanNeed;
  secondaryNeeds: HumanNeed[];
  gravityScore: number;
  positiveGoal: string;
  transformedGoal: string;
  needConfidence: number;
  safetyPriority: number;
  ambitionAdjustment: number;
  confidenceModifier: number;
  literalDesireUnsafe: boolean;
  actionPermission: MeaningActionPermission;
  alignmentFocus: string;
};

export type MeaningTraceFactor = {
  id: string;
  label: string;
  value: number | string | boolean | null;
  score: number;
  reason: string;
};

export type MeaningTrace = {
  inputText: string;
  normalizedText: string;
  detectedDesireTerms: string[];
  detectedEmotionalMarkers: string[];
  mappedNeeds: HumanNeed[];
  gravityFactors: MeaningTraceFactor[];
  transformationRuleUsed: string;
  safetyConstraints: string[];
  confidence: number;
  missingContext: string[];
  warnings: string[];
};

export type MeaningResult = {
  module: "meaning";
  version: "v1";
  surfaceDesire: string;
  gravityScore: number;
  gravityLabel: MeaningGravityLabel;
  primaryNeed: HumanNeed;
  secondaryNeeds: HumanNeed[];
  needConfidence: number;
  positiveGoal: string;
  transformedGoal: string;
  safetyConstraints: string[];
  riskWarnings: string[];
  purposeInputs: MeaningPurposeContext;
  recommendedPurposeAdjustment: string;
  alignmentNotes: string[];
  explanation: string;
  trace: MeaningTrace;
};

type MeaningRule = {
  id: string;
  patterns: RegExp[];
  desireTerms: string[];
  emotionalMarkers: string[];
  needs: HumanNeed[];
  gravity: number;
  confidence: number;
  surfaceDesire: string;
  positiveGoal: string;
  transformedGoal?: string;
  safetyConstraints?: string[];
  riskWarnings?: string[];
  alignmentNotes?: string[];
};

const NEED_KEYWORDS: Array<{ need: HumanNeed; patterns: RegExp[] }> = [
  {
    need: "survival",
    patterns: [/surviv(e|al)|ruin|blow up|lose everything|all in/],
  },
  {
    need: "safety",
    patterns: [/safe|protect|risk|avoid harm|not blow up|secure/],
  },
  {
    need: "security",
    patterns: [/secure|loss|capital|money|income|recover|stability/],
  },
  {
    need: "stability",
    patterns: [/stable|steady|consistent|predictable|routine/],
  },
  {
    need: "relief",
    patterns: [/relief|stop feeling|stress|pressure|urgent|panic|desperate/],
  },
  {
    need: "control",
    patterns: [/control|never lose|certainty|guarantee|revenge|force/],
  },
  { need: "autonomy", patterns: [/autonomy|independent|choice|self-directed/] },
  { need: "freedom", patterns: [/freedom|free|rich|wealth|option|escape/] },
  { need: "growth", patterns: [/grow|progress|improve|learn|develop/] },
  { need: "mastery", patterns: [/mastery|excellent|skill|discipline|craft/] },
  { need: "achievement", patterns: [/achieve|win|success|outperform|goal/] },
  {
    need: "esteem",
    patterns: [/esteem|respect|behind|prove|status|confidence/],
  },
  {
    need: "belonging",
    patterns: [/belong|accepted|included|behind everyone|left behind/],
  },
  {
    need: "identity",
    patterns: [/identity|become|excellent|who i am|person i want/],
  },
  { need: "purpose", patterns: [/purpose|why|mission|direction/] },
  { need: "peace", patterns: [/peace|calm|never lose|safe|steady/] },
  {
    need: "excitement",
    patterns: [/excite|thrill|gamble|adventure|aggressive/],
  },
  { need: "recovery", patterns: [/recover|heal|bounce back|make back|loss/] },
  { need: "contribution", patterns: [/contribute|help|serve|impact/] },
  { need: "meaning", patterns: [/meaning|matter|worthwhile|significant/] },
];

const RULES: MeaningRule[] = [
  {
    id: "controlled-aggressive-growth",
    patterns: [
      /grow aggressively.*(do not|don't|without|avoid).*(blow up|ruin|lose everything|risk of ruin)/,
      /aggressive.*(do not|don't|without|avoid).*(blow up|ruin|lose everything|risk of ruin)/,
    ],
    desireTerms: ["grow aggressively", "do not blow up"],
    emotionalMarkers: ["ambition", "survival protection"],
    needs: ["growth", "achievement", "safety", "security"],
    gravity: 5,
    confidence: 0.86,
    surfaceDesire: "Grow aggressively without blowing up.",
    positiveGoal: "Pursue strong growth through controlled, survivable risk.",
    transformedGoal:
      "Allow growth only when downside protection and recovery capacity stay intact.",
    safetyConstraints: [
      "Do not increase exposure when risk of ruin, forced liquidation, or unrecoverable drawdown is elevated.",
      "Prefer reversible steps and stronger confirmation before increasing pace.",
    ],
    alignmentNotes: [
      "The safety condition is part of the goal, not a secondary preference.",
    ],
  },
  {
    id: "gamble-everything",
    patterns: [
      /gambl(e|ing).*(everything|all|it all)/,
      /\ball[-\s]?in\b/,
      /bet (it )?all/,
      /\byolo\b/,
    ],
    desireTerms: ["gamble everything", "all in", "bet it all"],
    emotionalMarkers: ["high urgency", "total exposure", "escape pressure"],
    needs: ["excitement", "control", "freedom", "survival"],
    gravity: -10,
    confidence: 0.94,
    surfaceDesire: "Gamble everything.",
    positiveGoal:
      "Create controlled exposure to high-upside opportunities while protecting survival.",
    transformedGoal:
      "Use controlled exposure and capped, reversible risk for excitement and upside without putting core resources at risk.",
    safetyConstraints: [
      "Block actions that risk core capital, health, shelter, or essential obligations.",
      "Use hard exposure caps and require review before any high-upside action.",
    ],
    riskWarnings: [
      "Following the literal desire would violate survival constraints.",
    ],
    alignmentNotes: [
      "Excitement is valid, but total exposure is not a safe way to meet it.",
    ],
  },
  {
    id: "revenge",
    patterns: [
      /revenge/,
      /make (the market|them) pay/,
      /punish (the market|them)/,
      /take it back from (the market|them)/,
    ],
    desireTerms: ["revenge", "make the market pay"],
    emotionalMarkers: ["anger", "regret pressure", "control pressure"],
    needs: ["control", "relief", "security", "esteem"],
    gravity: -9,
    confidence: 0.92,
    surfaceDesire: "Take revenge on the market.",
    positiveGoal:
      "Regain control and confidence through disciplined recovery, not retaliation.",
    transformedGoal:
      "Regain control through disciplined recovery, smaller decisions, and evidence-backed trust.",
    safetyConstraints: [
      "Do not allow retaliatory actions to increase size, leverage, or urgency.",
      "Require a cooling-off period or review before acting on anger-driven signals.",
    ],
    riskWarnings: [
      "The literal desire is likely to turn regret into higher risk.",
    ],
    alignmentNotes: [
      "The underlying need is control and relief; retaliation is the unsafe expression.",
    ],
  },
  {
    id: "loss-recovery-fast",
    patterns: [
      /recover.*loss.*(quick|fast|now)/,
      /make back.*loss/,
      /win back.*loss/,
      /chase.*loss/,
    ],
    desireTerms: ["recover losses quickly", "make back losses", "chase losses"],
    emotionalMarkers: ["urgency", "regret", "recovery pressure"],
    needs: ["security", "relief", "recovery"],
    gravity: -7,
    confidence: 0.91,
    surfaceDesire: "Recover losses quickly.",
    positiveGoal:
      "Recover confidence and capital gradually without increasing risk of ruin.",
    transformedGoal:
      "Recover confidence and capital gradually while using smaller exposure, stronger confirmation, and patience.",
    safetyConstraints: [
      "Do not increase risk to force a faster recovery.",
      "Require stronger confirmation and smaller position sizing during recovery.",
    ],
    riskWarnings: [
      "Urgent recovery pressure can convert a loss into a larger survival problem.",
    ],
    alignmentNotes: [
      "Recovery is constructive when pace is governed by survivability.",
    ],
  },
  {
    id: "get-rich-fast",
    patterns: [
      /get rich fast/,
      /rich quickly/,
      /quick money/,
      /make money fast/,
      /wealth fast/,
    ],
    desireTerms: ["get rich fast", "quick money"],
    emotionalMarkers: ["urgency", "shortcut pressure"],
    needs: ["freedom", "security", "achievement", "excitement"],
    gravity: -6,
    confidence: 0.86,
    surfaceDesire: "Get rich fast.",
    positiveGoal:
      "Build financial freedom through repeatable progress without relying on shortcuts.",
    transformedGoal:
      "Build financial freedom by seeking asymmetric opportunities only when evidence, sizing, and time horizon are sustainable.",
    safetyConstraints: [
      "Do not optimize for speed when it requires fragile leverage or unrecoverable downside.",
      "Prefer repeatable decision quality over one-shot payoff seeking.",
    ],
    riskWarnings: ["Speed pressure can hide downside and weaken judgment."],
  },
  {
    id: "never-lose",
    patterns: [
      /never lose/,
      /avoid all losses/,
      /can't lose/,
      /cannot lose/,
      /guaranteed (win|profit|return)/,
    ],
    desireTerms: ["never lose", "avoid all losses", "guaranteed win"],
    emotionalMarkers: ["certainty seeking", "fear of loss"],
    needs: ["safety", "control", "peace"],
    gravity: -5,
    confidence: 0.88,
    surfaceDesire: "Avoid all losses.",
    positiveGoal:
      "Reduce avoidable losses while accepting that uncertainty cannot be eliminated.",
    transformedGoal:
      "Reduce avoidable losses while accepting that uncertainty cannot be eliminated.",
    safetyConstraints: [
      "Do not promise certainty or remove uncertainty from the explanation.",
      "Use risk controls instead of guarantees.",
    ],
    riskWarnings: [
      "Trying to eliminate all loss can create brittle decisions.",
    ],
  },
  {
    id: "feeling-behind",
    patterns: [
      /feeling behind/,
      /feel behind/,
      /left behind/,
      /catch up/,
      /behind everyone/,
    ],
    desireTerms: ["stop feeling behind", "catch up"],
    emotionalMarkers: ["comparison pressure", "urgency", "esteem pressure"],
    needs: ["esteem", "belonging", "growth", "relief"],
    gravity: -5,
    confidence: 0.82,
    surfaceDesire: "Stop feeling behind.",
    positiveGoal:
      "Build steady progress and confidence from a pace that can be sustained.",
    transformedGoal:
      "Build steady progress against a stable personal path instead of urgency from comparison.",
    safetyConstraints: [
      "Do not let comparison pressure set action size or urgency.",
      "Use progress evidence before increasing pace.",
    ],
    riskWarnings: [
      "Comparison can make risky acceleration feel necessary when it is not.",
    ],
  },
  {
    id: "steady-progress",
    patterns: [
      /steady progress/,
      /consistent progress/,
      /sustainable progress/,
      /slow and steady/,
    ],
    desireTerms: ["steady progress"],
    emotionalMarkers: ["patience", "stability"],
    needs: ["stability", "growth", "peace"],
    gravity: 7,
    confidence: 0.9,
    surfaceDesire: "Make steady progress.",
    positiveGoal: "Make consistent progress through clear, sustainable steps.",
    safetyConstraints: [
      "Keep pace aligned with evidence, recovery capacity, and long-term trust.",
    ],
  },
  {
    id: "become-excellent",
    patterns: [
      /become excellent/,
      /be excellent/,
      /mastery/,
      /become great/,
      /become world[-\s]?class/,
    ],
    desireTerms: ["become excellent", "mastery"],
    emotionalMarkers: ["identity alignment", "discipline"],
    needs: ["mastery", "achievement", "identity"],
    gravity: 10,
    confidence: 0.92,
    surfaceDesire: "Become excellent.",
    positiveGoal:
      "Improve decision quality over time through disciplined learning and feedback.",
    transformedGoal:
      "Improve decision quality through practice, feedback, calibration, and recovery.",
    safetyConstraints: [
      "Do not sacrifice recovery or integrity for short-term performance.",
    ],
  },
  {
    id: "financial-freedom",
    patterns: [
      /financial freedom/,
      /freedom with money/,
      /money freedom/,
      /be financially free/,
    ],
    desireTerms: ["financial freedom"],
    emotionalMarkers: ["autonomy", "security"],
    needs: ["freedom", "autonomy", "security"],
    gravity: 8,
    confidence: 0.9,
    surfaceDesire: "Build financial freedom.",
    positiveGoal:
      "Increase freedom and security through durable financial choices.",
    safetyConstraints: [
      "Balance upside with liquidity, resilience, and time horizon.",
    ],
  },
  {
    id: "safety",
    patterns: [/\bsafety\b/, /\bfeel safe\b/, /\bbe safe\b/, /\bprotect\b/],
    desireTerms: ["safety", "protect"],
    emotionalMarkers: ["protection"],
    needs: ["safety", "security", "peace"],
    gravity: 6,
    confidence: 0.82,
    surfaceDesire: "Stay safe.",
    positiveGoal:
      "Protect what matters while moving only at a sustainable pace.",
    safetyConstraints: [
      "Keep survival, stability, and recovery capacity ahead of speed.",
    ],
  },
  {
    id: "excitement",
    patterns: [/\bexcitement\b/, /\bexciting\b/, /\bthrill\b/, /\badventure\b/],
    desireTerms: ["excitement"],
    emotionalMarkers: ["novelty seeking", "energy"],
    needs: ["excitement", "growth", "meaning"],
    gravity: 3,
    confidence: 0.78,
    surfaceDesire: "Feel excitement.",
    positiveGoal:
      "Channel excitement into bounded exploration that preserves safety.",
    transformedGoal:
      "Use bounded exploration, novelty, and challenge inside clear limits rather than impulsive exposure.",
    safetyConstraints: ["Set boundaries before seeking novelty or intensity."],
  },
  {
    id: "hostile-harm",
    patterns: [
      /destroy/,
      /hurt them/,
      /make them suffer/,
      /crush them/,
      /wipe them out/,
    ],
    desireTerms: ["destroy", "hurt", "make them suffer"],
    emotionalMarkers: ["hostility", "anger"],
    needs: ["relief", "control", "safety"],
    gravity: -9,
    confidence: 0.78,
    surfaceDesire: "Use harm to regain control.",
    positiveGoal:
      "Restore safety and control without harming people or creating irreversible damage.",
    transformedGoal:
      "Block harmful action and redirect toward de-escalation, review, and safe boundaries.",
    safetyConstraints: [
      "Block actions that could harm people or create irreversible damage.",
      "Escalate to review when the desired action depends on harm.",
    ],
    riskWarnings: ["The literal desire is unsafe and must not drive action."],
  },
];

export function evaluateMeaning(input: MeaningInput | string): MeaningResult {
  const rawText = typeof input === "string" ? input : input.text;
  const context = typeof input === "string" ? undefined : input.context;
  const normalizedText = normalizeText(rawText);
  const empty = normalizedText.length === 0;
  const matches = empty
    ? []
    : RULES.filter((rule) =>
        rule.patterns.some((pattern) => pattern.test(normalizedText)),
      );
  const selected = selectRule(matches);
  const keywordNeeds = mappedNeedsFor(normalizedText);
  const needs = uniqueNeeds([...(selected?.needs ?? []), ...keywordNeeds]);
  const detectedDesireTerms = uniqueStrings([
    ...(selected?.desireTerms ?? []),
    ...detectTerms(normalizedText),
  ]);
  const emotionalMarkers = uniqueStrings([
    ...(selected?.emotionalMarkers ?? []),
    ...detectEmotionalMarkers(normalizedText),
  ]);
  const gravityFactors = gravityFactorsFor(normalizedText, selected, empty);
  const gravityScore = scoreGravity(selected, gravityFactors, empty);
  const primaryNeed = needs[0] ?? (empty ? "meaning" : "growth");
  const secondaryNeeds = needs
    .filter((need) => need !== primaryNeed)
    .slice(0, 5);
  const needConfidence = confidenceFor({
    text: normalizedText,
    selected,
    needs,
    emotionalMarkers,
    empty,
  });
  const surfaceDesire = empty
    ? "Clarify a goal."
    : (selected?.surfaceDesire ?? summarizeSurfaceDesire(rawText));
  const positiveGoal =
    selected?.positiveGoal ??
    positiveGoalFor(primaryNeed, secondaryNeeds, surfaceDesire, gravityScore);
  const transformedGoal =
    selected?.transformedGoal ??
    transformedGoalFor(positiveGoal, gravityScore, needConfidence);
  const safetyConstraints = safetyConstraintsFor({
    selected,
    gravityScore,
    needConfidence,
    context,
    empty,
  });
  const riskWarnings = riskWarningsFor({
    selected,
    gravityScore,
    needConfidence,
    empty,
    normalizedText,
  });
  const alignmentNotes = alignmentNotesFor({
    selected,
    gravityScore,
    needConfidence,
    primaryNeed,
    secondaryNeeds,
  });
  const purposeInputs = purposeContextFor({
    primaryNeed,
    secondaryNeeds,
    gravityScore,
    needConfidence,
    positiveGoal,
    transformedGoal,
  });
  const recommendedPurposeAdjustment =
    recommendedPurposeAdjustmentFor(purposeInputs);
  const traceWarnings = traceWarningsFor(riskWarnings, needConfidence, empty);
  const missingContext = missingContextFor(
    normalizedText,
    needConfidence,
    context,
  );

  return {
    module: "meaning",
    version: "v1",
    surfaceDesire,
    gravityScore,
    gravityLabel: gravityLabelFor(gravityScore),
    primaryNeed,
    secondaryNeeds,
    needConfidence,
    positiveGoal,
    transformedGoal,
    safetyConstraints,
    riskWarnings,
    purposeInputs,
    recommendedPurposeAdjustment,
    alignmentNotes,
    explanation: explanationFor({
      selected,
      surfaceDesire,
      primaryNeed,
      secondaryNeeds,
      gravityScore,
      transformedGoal,
      needConfidence,
    }),
    trace: {
      inputText: rawText,
      normalizedText,
      detectedDesireTerms,
      detectedEmotionalMarkers: emotionalMarkers,
      mappedNeeds: [primaryNeed, ...secondaryNeeds],
      gravityFactors,
      transformationRuleUsed:
        selected?.id ?? (empty ? "empty-input" : "generic-need-mapping"),
      safetyConstraints,
      confidence: needConfidence,
      missingContext,
      warnings: traceWarnings,
    },
  };
}

export const meaning = evaluateMeaning;

function selectRule(matches: MeaningRule[]) {
  if (!matches.length) return undefined;
  return [...matches].sort((left, right) => {
    const severityDelta = Math.abs(right.gravity) - Math.abs(left.gravity);
    if (severityDelta !== 0) return severityDelta;
    return right.confidence - left.confidence;
  })[0];
}

function mappedNeedsFor(text: string): HumanNeed[] {
  if (!text) return [];
  return NEED_KEYWORDS.filter((item) =>
    item.patterns.some((pattern) => pattern.test(text)),
  ).map((item) => item.need);
}

function detectTerms(text: string) {
  return [
    ["recover losses", /recover.*loss|make back.*loss|win back.*loss/],
    ["gamble", /gambl|bet|all[-\s]?in|\byolo\b/],
    ["revenge", /revenge|make .*pay|punish/],
    ["get rich fast", /rich fast|quick money|money fast/],
    ["never lose", /never lose|avoid all losses|guarantee/],
    ["steady progress", /steady|consistent|sustainable/],
    ["excellence", /excellent|mastery|world[-\s]?class/],
    ["freedom", /freedom|autonomy|independent/],
    ["safety", /safe|safety|protect|not blow up/],
    ["excitement", /excite|thrill|adventure/],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(text))
    .map(([term]) => term as string);
}

function detectEmotionalMarkers(text: string) {
  return [
    ["urgency", /quick|fast|now|immediately|urgent/],
    ["regret", /loss|mistake|behind|recover|make back/],
    ["anger", /revenge|punish|hate|angry|furious/],
    ["fear of loss", /never lose|avoid all losses|safe|protect|fear/],
    ["identity alignment", /become|identity|excellent|mastery/],
    ["novelty seeking", /excite|thrill|adventure|gamble/],
    ["comparison pressure", /behind|catch up|prove/],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(text))
    .map(([marker]) => marker as string);
}

function gravityFactorsFor(
  text: string,
  selected: MeaningRule | undefined,
  empty: boolean,
): MeaningTraceFactor[] {
  if (empty) {
    return [
      factor(
        "empty-input",
        "Empty input",
        0,
        0,
        "No literal desire was available, so Meaning uses a safe clarification goal.",
      ),
    ];
  }

  const factors: MeaningTraceFactor[] = [];
  if (selected) {
    factors.push(
      factor(
        selected.id,
        "Matched transformation rule",
        selected.gravity,
        selected.gravity,
        "A deterministic rule matched the desire text.",
      ),
    );
  }
  addFactor(
    factors,
    text,
    /everything|all[-\s]?in|bet (it )?all|\byolo\b/,
    "total-exposure",
    "Total exposure",
    -10,
    "Total exposure would violate survival protection.",
  );
  addFactor(
    factors,
    text,
    /revenge|punish|make .*pay/,
    "retaliation",
    "Retaliation",
    -9,
    "Retaliation tends to convert pain into unsafe action.",
  );
  addFactor(
    factors,
    text,
    /quick|fast|now|immediately|urgent/,
    "urgency",
    "Urgency",
    -5,
    "Urgency can shorten the feedback loop below safe decision quality.",
  );
  addFactor(
    factors,
    text,
    /never lose|avoid all losses|guarantee/,
    "certainty-demand",
    "Certainty demand",
    -5,
    "Certainty demands can create brittle decisions.",
  );
  addFactor(
    factors,
    text,
    /loss|recover|make back|behind|catch up/,
    "recovery-pressure",
    "Recovery pressure",
    -4,
    "Recovery and comparison pressure can bias action size.",
  );
  addFactor(
    factors,
    text,
    /safe|protect|not blow up|surviv|risk of ruin/,
    "survival-awareness",
    "Survival awareness",
    5,
    "The text explicitly asks to protect survival or safety.",
  );
  addFactor(
    factors,
    text,
    /steady|consistent|sustainable|gradual/,
    "sustainability",
    "Sustainability",
    7,
    "The text favors stable, repeatable progress.",
  );
  addFactor(
    factors,
    text,
    /excellent|mastery|learn|discipline|feedback/,
    "mastery",
    "Mastery",
    10,
    "The text points toward disciplined growth and identity-aligned progress.",
  );
  addFactor(
    factors,
    text,
    /freedom|autonomy|contribution|purpose|meaning/,
    "positive-meaning",
    "Positive meaning",
    7,
    "The text points toward durable autonomy, contribution, or purpose.",
  );

  return factors.length
    ? uniqueFactors(factors)
    : [
        factor(
          "unclear",
          "Unclear gravity",
          0,
          0,
          "No strong gravity markers were detected.",
        ),
      ];
}

function addFactor(
  factors: MeaningTraceFactor[],
  text: string,
  pattern: RegExp,
  id: string,
  label: string,
  score: number,
  reason: string,
) {
  if (pattern.test(text)) factors.push(factor(id, label, true, score, reason));
}

function factor(
  id: string,
  label: string,
  value: number | string | boolean | null,
  score: number,
  reason: string,
): MeaningTraceFactor {
  return { id, label, value, score: roundGravity(score), reason };
}

function scoreGravity(
  selected: MeaningRule | undefined,
  factors: MeaningTraceFactor[],
  empty: boolean,
) {
  if (empty) return 0;
  if (selected) return roundGravity(selected.gravity);
  const scores = factors
    .map((item) => item.score)
    .filter((value) => value !== 0);
  if (!scores.length) return 0;
  const strongestNegative = scores
    .filter((score) => score < 0)
    .sort((left, right) => left - right)[0];
  const strongestPositive = scores
    .filter((score) => score > 0)
    .sort((left, right) => right - left)[0];
  if (strongestNegative != null && strongestPositive != null) {
    return roundGravity(strongestNegative * 0.7 + strongestPositive * 0.3);
  }
  return roundGravity(mean(scores));
}

function confidenceFor(input: {
  text: string;
  selected?: MeaningRule;
  needs: HumanNeed[];
  emotionalMarkers: string[];
  empty: boolean;
}) {
  if (input.empty) return 0.2;
  const words = input.text.split(/\s+/).filter(Boolean);
  const unsupportedPenalty = unsupportedLanguageRisk(input.text) * 0.24;
  const brevityPenalty =
    words.length <= 2 ? 0.18 : words.length <= 4 ? 0.08 : 0;
  const ambiguityPenalty = /maybe|something|stuff|whatever|idk|not sure/.test(
    input.text,
  )
    ? 0.18
    : 0;
  const contradictionPenalty = /\bbut\b|\bhowever\b|\bwithout\b/.test(
    input.text,
  )
    ? 0.04
    : 0;
  const base = input.selected
    ? input.selected.confidence
    : 0.46 +
      Math.min(0.22, input.needs.length * 0.04) +
      Math.min(0.12, input.emotionalMarkers.length * 0.03);
  return roundConfidence(
    base -
      unsupportedPenalty -
      brevityPenalty -
      ambiguityPenalty -
      contradictionPenalty,
  );
}

function positiveGoalFor(
  primaryNeed: HumanNeed,
  secondaryNeeds: HumanNeed[],
  surfaceDesire: string,
  gravityScore: number,
) {
  const needPhrase = humanizeNeeds([primaryNeed, ...secondaryNeeds]);
  if (gravityScore < 0) {
    return `Meet the need for ${needPhrase} through a safer, sustainable path.`;
  }
  return `${surfaceDesire.replace(/\.$/, "")} in a way that supports ${needPhrase} and long-term trust.`;
}

function transformedGoalFor(
  positiveGoal: string,
  gravityScore: number,
  needConfidence: number,
) {
  if (gravityScore <= -8)
    return `Block the unsafe literal path and instead ${lowerFirst(positiveGoal)}`;
  if (gravityScore <= -5)
    return `Reduce urgency and ${lowerFirst(positiveGoal)}`;
  if (needConfidence < 0.45)
    return `Clarify the goal while preserving a safe version: ${lowerFirst(positiveGoal)}`;
  return positiveGoal;
}

function safetyConstraintsFor(input: {
  selected?: MeaningRule;
  gravityScore: number;
  needConfidence: number;
  context: MeaningInput["context"] | undefined;
  empty: boolean;
}) {
  const constraints = [
    ...(input.selected?.safetyConstraints ?? []),
    ...safeStringArray(input.context?.safetyConstraints),
    "Use only the supplied goal text; do not infer sensitive personal attributes.",
  ];
  if (input.empty)
    constraints.push("Ask for goal text before optimizing action.");
  if (input.gravityScore <= -9) {
    constraints.push(
      "Block literal actions that create irreversible harm or survival risk.",
    );
  } else if (input.gravityScore <= -7) {
    constraints.push(
      "Require review before increasing size, speed, or commitment.",
    );
  } else if (input.gravityScore <= -5) {
    constraints.push(
      "Prefer smaller reversible steps until the pressure behind the desire cools.",
    );
  }
  if (input.needConfidence < 0.45) {
    constraints.push(
      "Treat the interpretation as degraded and ask for more context before aggressive optimization.",
    );
  }
  return uniqueStrings(constraints);
}

function riskWarningsFor(input: {
  selected?: MeaningRule;
  gravityScore: number;
  needConfidence: number;
  empty: boolean;
  normalizedText: string;
}) {
  const warnings = [...(input.selected?.riskWarnings ?? [])];
  if (input.empty)
    warnings.push(
      "No desire text was supplied, so Meaning cannot infer a reliable need.",
    );
  if (input.gravityScore <= -8)
    warnings.push(
      "The literal desire is unsafe enough to require blocking or review.",
    );
  else if (input.gravityScore <= -5)
    warnings.push(
      "The literal desire is emotionally charged and should not directly control action.",
    );
  if (input.needConfidence < 0.45)
    warnings.push(
      "Need confidence is low; ask for more evidence before optimizing.",
    );
  if (unsupportedLanguageRisk(input.normalizedText) > 0.35)
    warnings.push(
      "Language support is uncertain; interpretation confidence is reduced.",
    );
  return uniqueStrings(warnings);
}

function alignmentNotesFor(input: {
  selected?: MeaningRule;
  gravityScore: number;
  needConfidence: number;
  primaryNeed: HumanNeed;
  secondaryNeeds: HumanNeed[];
}) {
  const notes = [...(input.selected?.alignmentNotes ?? [])];
  notes.push(`Primary positive need: ${input.primaryNeed}.`);
  if (input.secondaryNeeds.length)
    notes.push(`Secondary needs: ${input.secondaryNeeds.join(", ")}.`);
  if (input.gravityScore < 0) {
    notes.push(
      "The literal desire was transformed because following it directly would be less sustainable.",
    );
  } else {
    notes.push(
      "The literal desire can be preserved with normal safety checks.",
    );
  }
  if (input.needConfidence < 0.45)
    notes.push("Use degraded mode until the user gives clearer goal evidence.");
  return uniqueStrings(notes);
}

function purposeContextFor(input: {
  primaryNeed: HumanNeed;
  secondaryNeeds: HumanNeed[];
  gravityScore: number;
  needConfidence: number;
  positiveGoal: string;
  transformedGoal: string;
}): MeaningPurposeContext {
  const unsafe = input.gravityScore <= -5;
  const permission =
    input.gravityScore <= -9
      ? "block"
      : input.gravityScore <= -7 || input.needConfidence < 0.45
        ? "review"
        : input.gravityScore <= -5
          ? "reduce"
          : "allow";
  return {
    desiredFuture: input.transformedGoal,
    primaryNeed: input.primaryNeed,
    secondaryNeeds: input.secondaryNeeds,
    gravityScore: input.gravityScore,
    positiveGoal: input.positiveGoal,
    transformedGoal: input.transformedGoal,
    needConfidence: input.needConfidence,
    safetyPriority: clamp(
      55 + Math.max(0, -input.gravityScore) * 5 + (unsafe ? 10 : 0),
    ),
    ambitionAdjustment: roundScore(
      input.gravityScore < 0 ? input.gravityScore * 5 : input.gravityScore * 2,
      -100,
      100,
    ),
    confidenceModifier: roundScore(
      (input.needConfidence - 0.7) * 60 - Math.max(0, -input.gravityScore) * 2,
      -100,
      100,
    ),
    literalDesireUnsafe: unsafe,
    actionPermission: permission,
    alignmentFocus: unsafe ? "transformed-goal" : "positive-goal",
  };
}

function recommendedPurposeAdjustmentFor(context: MeaningPurposeContext) {
  if (context.actionPermission === "block") {
    return `Purpose should block the literal desire and optimize only for: ${context.transformedGoal}`;
  }
  if (context.actionPermission === "review") {
    return `Purpose should reduce confidence, require review, and optimize for: ${context.transformedGoal}`;
  }
  if (context.actionPermission === "reduce") {
    return `Purpose should lower urgency and favor smaller reversible steps toward: ${context.transformedGoal}`;
  }
  return `Purpose can preserve the desire while optimizing for: ${context.transformedGoal}`;
}

function explanationFor(input: {
  selected?: MeaningRule;
  surfaceDesire: string;
  primaryNeed: HumanNeed;
  secondaryNeeds: HumanNeed[];
  gravityScore: number;
  transformedGoal: string;
  needConfidence: number;
}) {
  const needs = humanizeNeeds([input.primaryNeed, ...input.secondaryNeeds]);
  const transformation =
    input.gravityScore < 0
      ? "The original desire was transformed because following it literally would be less safe or less sustainable."
      : "The original desire was preserved and framed as a sustainable goal.";
  return `${input.surfaceDesire} points to ${needs}. Gravity is ${input.gravityScore}/10. ${transformation} Meaning recommends: ${input.transformedGoal} Confidence ${Math.round(input.needConfidence * 100)}%.`;
}

function traceWarningsFor(
  riskWarnings: string[],
  needConfidence: number,
  empty: boolean,
) {
  const warnings = [...riskWarnings];
  if (needConfidence < 0.45 && !empty)
    warnings.push(
      "Trace confidence is degraded by ambiguity or limited evidence.",
    );
  return uniqueStrings(warnings);
}

function missingContextFor(
  text: string,
  needConfidence: number,
  context: MeaningInput["context"] | undefined,
) {
  const missing: string[] = [];
  if (!text) missing.push("text");
  if (needConfidence < 0.55) missing.push("user intent evidence");
  if (!context?.domain) missing.push("domain context");
  if (!context?.currentGoal) missing.push("current goal context");
  return uniqueStrings(missing);
}

function gravityLabelFor(score: number): MeaningGravityLabel {
  if (score <= -9) return "destructive";
  if (score <= -7) return "strongly-negative";
  if (score < 0) return "risky";
  if (score === 0) return "neutral";
  if (score < 9) return "constructive";
  return "deeply-constructive";
}

function summarizeSurfaceDesire(text: string) {
  const cleaned = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^i\s+(really\s+)?want\s+to\s+/i, "")
    .replace(/^i\s+(really\s+)?want\s+/i, "")
    .replace(/^we\s+want\s+to\s+/i, "")
    .replace(/[.!?]+$/g, "");
  const clipped =
    cleaned.length > 140 ? `${cleaned.slice(0, 137).trim()}...` : cleaned;
  return `${capitalize(clipped || "clarify a goal")}.`;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function unsupportedLanguageRisk(text: string) {
  if (!text) return 0;
  const letters = Array.from(text).filter((char) => /\p{L}/u.test(char));
  if (!letters.length) return 0.35;
  const asciiLetters = letters.filter((char) => /[a-z]/i.test(char));
  return clamp(1 - asciiLetters.length / letters.length, 0, 1);
}

function humanizeNeeds(needs: HumanNeed[]) {
  const unique = uniqueNeeds(needs).slice(0, 4);
  if (unique.length <= 1) return unique[0] ?? "sustainable progress";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

function roundGravity(value: number) {
  return Math.round(clamp(value, -10, 10));
}

function roundScore(value: number, min = 0, max = 100) {
  return Math.round(clamp(value, min, max));
}

function roundConfidence(value: number) {
  return Number(clamp(value, 0, 1).toFixed(2));
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function uniqueNeeds(values: HumanNeed[]) {
  const allowed = new Set<HumanNeed>(HUMAN_NEEDS as unknown as HumanNeed[]);
  return Array.from(
    new Set(values.filter((value): value is HumanNeed => allowed.has(value))),
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueFactors(values: MeaningTraceFactor[]) {
  const seen = new Set<string>();
  return values.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function lowerFirst(value: string) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}
