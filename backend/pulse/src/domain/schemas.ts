import { z } from "zod";

const SubjectSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const EvaluateFrameInputSchema = z.object({
  subject: SubjectSchema,
  profileId: z.string().min(1),
  observedAt: z.string().min(1),
  inputs: z.record(z.number()),
});

const FeatureSpecSchema = z.object({
  key: z.string().min(1),
  required: z.boolean().optional(),
  weight: z.number().optional(),
});

const NormalizationRuleSchema = z.object({
  key: z.string().min(1),
  method: z.enum(["minmax", "zscore", "none"]),
  min: z.number().optional(),
  max: z.number().optional(),
  mean: z.number().optional(),
  stdDev: z.number().optional(),
});

const ScoreRuleSchema = z.object({
  scoreKey: z.string().min(1),
  method: z.literal("weighted_sum"),
  featureWeights: z.record(z.number()),
});

const GateRuleSchema = z.object({
  minConfidence: z.number().optional(),
  minScores: z.record(z.number()).optional(),
});

const FreshnessPolicySchema = z.object({
  maxAgeMs: z.number().int().nonnegative(),
  onExpired: z.enum(["reject", "degrade"]),
});

const ExplanationConfigSchema = z.object({
  drivers: z.array(z.string()),
});

export const ProfileSchema = z.object({
  profileId: z.string().min(1),
  version: z.string().min(1),
  subjectType: z.string().min(1),
  window: z.object({ sizeMs: z.number().int().positive() }),
  features: z.array(FeatureSpecSchema),
  normalization: z.array(NormalizationRuleSchema),
  scoring: z.array(ScoreRuleSchema),
  gate: GateRuleSchema,
  freshnessPolicy: FreshnessPolicySchema,
  explanation: ExplanationConfigSchema,
  enabled: z.boolean(),
});
