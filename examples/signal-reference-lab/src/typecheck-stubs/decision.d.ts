export type DecisionAssessment = {
  confidence: { capped: number };
  evidenceQuality: { quality: number };
  governance: { blockers: unknown[]; score: number };
  stewardship: { recommendation: string };
  explanation: string[];
};
export type DecisionOutcomeReview = unknown;
export declare function assessDecisionEvidence(input: any): DecisionAssessment;
export declare function reviewDecisionOutcome(input: any): any;
