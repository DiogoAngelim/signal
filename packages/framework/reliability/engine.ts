export type ReliabilityStatus = "healthy" | "degraded" | "insufficient" | "stale" | "invalid";

export type ReliabilityDiagnostic = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  field?: string;
  source?: string;
  observed?: unknown;
  expected?: unknown;
};

export type ReliabilityComponents = {
  freshness: number;
  completeness: number;
  sampleSize: number;
  sourceQuality: number;
  consistency: number;
  outlierSafety: number;
};

export type ReliabilityResult = {
  score: number;
  status: ReliabilityStatus;
  confidenceCap: number;
  components: ReliabilityComponents;
  diagnostics: ReliabilityDiagnostic[];
  metadata: {
    evaluatedAt: string;
    inputCount: number;
    validCount: number;
    rejectedCount: number;
  };
};

export type ReliabilityFieldType = "number" | "string" | "boolean" | "object" | "array";

export type ReliabilityFieldRule = {
  field: string;
  required?: boolean;
  type?: ReliabilityFieldType;
  allowNull?: boolean;
  min?: number;
  max?: number;
};

export type ReliabilityOutlierRule = {
  field: string;
  min?: number;
  max?: number;
  zScoreLimit?: number;
};

export type ReliabilityRecord = {
  id: string;
  timestamp?: number | string | Date | null;
  source?: string;
  fields?: Record<string, unknown>;
  quality?: number;
};

export type ReliabilityWeights = ReliabilityComponents;

export type ReliabilityEvaluation = {
  records: ReliabilityRecord[];
  now?: number;
  maxAgeMs?: number;
  minSampleSize?: number;
  expectedCount?: number;
  fieldRules?: ReliabilityFieldRule[];
  outlierRules?: ReliabilityOutlierRule[];
  sourceQuality?: Record<string, number>;
  defaultSourceQuality?: number;
  weights?: Partial<ReliabilityWeights>;
};

type RecordState = {
  rejected: boolean;
  stale: boolean;
  invalidTimestamp: boolean;
  sourceScore: number;
};

const DEFAULT_WEIGHTS: ReliabilityWeights = {
  freshness: 0.22,
  completeness: 0.22,
  sampleSize: 0.16,
  sourceQuality: 0.14,
  consistency: 0.14,
  outlierSafety: 0.12,
};

export class ReliabilityEngine {
  evaluate(input: ReliabilityEvaluation): ReliabilityResult {
    const now = input.now ?? Date.now();
    const diagnostics: ReliabilityDiagnostic[] = [];
    const records = Array.isArray(input.records) ? input.records : [];

    if (!Array.isArray(input.records)) {
      diagnostics.push({
        code: "INPUT_MALFORMED",
        severity: "critical",
        message: "Reliability input must provide a record array.",
        observed: typeof input.records,
        expected: "array",
      });
    }

    if (!records.length) {
      diagnostics.push({
        code: "INPUT_EMPTY",
        severity: "critical",
        message: "Reliability input did not contain any records.",
        observed: 0,
        expected: input.minSampleSize ?? 1,
      });
      return this.result(0, "invalid", diagnostics, now, 0, 0, 0);
    }

    const seenIds = new Set<string>();
    const states = records.map((record, index) =>
      this.evaluateRecord(record, index, input, now, seenIds, diagnostics),
    );
    const outlierCount = this.evaluateOutliers(records, input.outlierRules ?? [], diagnostics);
    const rejectedCount = states.filter((state) => state.rejected).length;
    const validCount = records.length - rejectedCount;
    const staleCount = states.filter((state) => state.stale).length;
    const invalidTimestampCount = states.filter((state) => state.invalidTimestamp).length;
    const duplicateCount = diagnostics.filter((diagnostic) => diagnostic.code === "RECORD_DUPLICATE").length;
    const missingOrInvalidFieldCount = diagnostics.filter(
      (diagnostic) => diagnostic.code === "FIELD_MISSING" || diagnostic.code === "FIELD_INVALID",
    ).length;

    if (validCount < (input.minSampleSize ?? 1)) {
      diagnostics.push({
        code: "SAMPLE_SIZE_LOW",
        severity: "critical",
        message: "Valid record count is below the minimum sample size.",
        observed: validCount,
        expected: input.minSampleSize ?? 1,
      });
    }

    const sourceQuality = mean(states.map((state) => state.sourceScore));
    if (sourceQuality < 60) {
      diagnostics.push({
        code: "SOURCE_QUALITY_DEGRADED",
        severity: sourceQuality < 35 ? "critical" : "warning",
        message: "One or more input sources have degraded quality.",
        observed: round(sourceQuality),
        expected: ">= 60",
      });
    }

    const components: ReliabilityComponents = {
      freshness: clamp(100 - ratio(staleCount, records.length) * 100 - ratio(invalidTimestampCount, records.length) * 30),
      completeness: clamp(100 - ratio(missingOrInvalidFieldCount, records.length * Math.max(1, input.fieldRules?.length ?? 1)) * 100),
      sampleSize: sampleSizeScore(validCount, input.minSampleSize, input.expectedCount),
      sourceQuality,
      consistency: clamp(100 - ratio(duplicateCount, records.length) * 55 - ratio(rejectedCount, records.length) * 35),
      outlierSafety: clamp(100 - ratio(outlierCount, records.length) * 70),
    };
    const score = weightedScore(components, input.weights);
    const status = reliabilityStatus(score, components, {
      validCount,
      staleCount,
      total: records.length,
      minSampleSize: input.minSampleSize ?? 1,
    });

    return this.result(score, status, diagnostics, now, records.length, validCount, rejectedCount, components);
  }

  private evaluateRecord(
    record: ReliabilityRecord,
    index: number,
    input: ReliabilityEvaluation,
    now: number,
    seenIds: Set<string>,
    diagnostics: ReliabilityDiagnostic[],
  ): RecordState {
    const id = String(record.id ?? "").trim() || `record:${index}`;
    const source = record.source;
    const state: RecordState = {
      rejected: false,
      stale: false,
      invalidTimestamp: false,
      sourceScore: sourceScore(record, input),
    };

    if (seenIds.has(id)) {
      state.rejected = true;
      diagnostics.push({
        code: "RECORD_DUPLICATE",
        severity: "warning",
        message: "Duplicate record identifier detected.",
        field: "id",
        source,
        observed: id,
      });
    }
    seenIds.add(id);

    const timestamp = parseTimestamp(record.timestamp);
    if (input.maxAgeMs != null) {
      if (timestamp == null) {
        state.invalidTimestamp = true;
        diagnostics.push({
          code: "TIMESTAMP_INVALID",
          severity: "warning",
          message: "Record timestamp is missing or invalid.",
          field: "timestamp",
          source,
          observed: record.timestamp,
          expected: "valid timestamp",
        });
      } else if (now - timestamp > input.maxAgeMs) {
        state.stale = true;
        diagnostics.push({
          code: "RECORD_STALE",
          severity: "warning",
          message: "Record is older than the configured freshness window.",
          field: "timestamp",
          source,
          observed: now - timestamp,
          expected: `<= ${input.maxAgeMs}`,
        });
      }
    }

    for (const rule of input.fieldRules ?? []) {
      const value = record.fields?.[rule.field];
      const missing = value == null && !rule.allowNull;
      if (rule.required && missing) {
        state.rejected = true;
        diagnostics.push({
          code: "FIELD_MISSING",
          severity: "critical",
          message: "Required field is missing.",
          field: rule.field,
          source,
          observed: value,
          expected: "present",
        });
        continue;
      }

      if (value == null) continue;

      if (!fieldMatchesType(value, rule.type)) {
        state.rejected = true;
        diagnostics.push({
          code: "FIELD_INVALID",
          severity: "critical",
          message: "Field value does not match the expected type.",
          field: rule.field,
          source,
          observed: value,
          expected: rule.type,
        });
        continue;
      }

      if (typeof value === "number" && ((rule.min != null && value < rule.min) || (rule.max != null && value > rule.max))) {
        state.rejected = true;
        diagnostics.push({
          code: "FIELD_OUT_OF_RANGE",
          severity: "critical",
          message: "Field value is outside the expected range.",
          field: rule.field,
          source,
          observed: value,
          expected: rangeText(rule.min, rule.max),
        });
      }
    }

    return state;
  }

  private evaluateOutliers(
    records: ReliabilityRecord[],
    rules: ReliabilityOutlierRule[],
    diagnostics: ReliabilityDiagnostic[],
  ) {
    let outlierCount = 0;

    for (const rule of rules) {
      const values = records
        .map((record) => numberValue(record.fields?.[rule.field]))
        .filter((value): value is number => value != null);
      const average = mean(values);
      const deviation = standardDeviation(values, average);

      records.forEach((record) => {
        const value = numberValue(record.fields?.[rule.field]);
        if (value == null) return;

        const fixedLimitOutlier = (rule.min != null && value < rule.min) || (rule.max != null && value > rule.max);
        const zScoreOutlier = rule.zScoreLimit != null && deviation > 0 && Math.abs((value - average) / deviation) > rule.zScoreLimit;

        if (fixedLimitOutlier || zScoreOutlier) {
          outlierCount += 1;
          diagnostics.push({
            code: "FIELD_OUTLIER",
            severity: "warning",
            message: "Field value is an outlier relative to configured limits.",
            field: rule.field,
            source: record.source,
            observed: value,
            expected: fixedLimitOutlier ? rangeText(rule.min, rule.max) : `z-score <= ${rule.zScoreLimit}`,
          });
        }
      });
    }

    return outlierCount;
  }

  private result(
    score: number,
    status: ReliabilityStatus,
    diagnostics: ReliabilityDiagnostic[],
    now: number,
    inputCount: number,
    validCount: number,
    rejectedCount: number,
    components: ReliabilityComponents = zeroComponents(),
  ): ReliabilityResult {
    return {
      score: round(score),
      status,
      confidenceCap: confidenceCapForReliability(score),
      components: roundComponents(components),
      diagnostics,
      metadata: {
        evaluatedAt: new Date(now).toISOString(),
        inputCount,
        validCount,
        rejectedCount,
      },
    };
  }
}

export function evaluateReliability(input: ReliabilityEvaluation): ReliabilityResult {
  return new ReliabilityEngine().evaluate(input);
}

export function confidenceCapForReliability(score: number) {
  const value = clamp(score);
  if (value < 25) return 20;
  if (value < 40) return 35;
  if (value < 60) return 55;
  if (value < 80) return 75;
  return 100;
}

function reliabilityStatus(
  score: number,
  components: ReliabilityComponents,
  state: { validCount: number; staleCount: number; total: number; minSampleSize: number },
): ReliabilityStatus {
  if (state.validCount <= 0) return "invalid";
  if (state.staleCount === state.total || (state.staleCount > 0 && score < 55)) return "stale";
  if (state.validCount < state.minSampleSize || score < 40) return "insufficient";
  if (Math.min(...Object.values(components)) < 60) return "degraded";
  if (score < 80) return "degraded";
  return "healthy";
}

function fieldMatchesType(value: unknown, type: ReliabilityFieldType | undefined) {
  if (!type) return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === type && (type !== "number" || Number.isFinite(value));
}

function sourceScore(record: ReliabilityRecord, input: ReliabilityEvaluation) {
  if (typeof record.quality === "number") return clamp(record.quality);
  if (record.source && input.sourceQuality?.[record.source] != null) return clamp(input.sourceQuality[record.source]);
  return clamp(input.defaultSourceQuality ?? 100);
}

function parseTimestamp(value: ReliabilityRecord["timestamp"]) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sampleSizeScore(validCount: number, minSampleSize = 1, expectedCount?: number) {
  const denominator = Math.max(1, expectedCount ?? minSampleSize);
  const base = clamp((validCount / denominator) * 100);
  if (validCount >= minSampleSize) return base;
  return Math.min(base, clamp((validCount / Math.max(1, minSampleSize)) * 60));
}

function weightedScore(components: ReliabilityComponents, weights: Partial<ReliabilityWeights> | undefined) {
  const merged = { ...DEFAULT_WEIGHTS, ...weights };
  const entries = Object.entries(merged) as Array<[keyof ReliabilityComponents, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0) || 1;
  return clamp(entries.reduce((sum, [key, weight]) => sum + components[key] * Math.max(0, weight), 0) / total);
}

function ratio(count: number, total: number) {
  return count / total;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[], average: number) {
  if (values.length < 2) return 0;
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round(value: number) {
  return Number(clamp(value).toFixed(2));
}

function roundComponents(components: ReliabilityComponents): ReliabilityComponents {
  return {
    freshness: round(components.freshness),
    completeness: round(components.completeness),
    sampleSize: round(components.sampleSize),
    sourceQuality: round(components.sourceQuality),
    consistency: round(components.consistency),
    outlierSafety: round(components.outlierSafety),
  };
}

function zeroComponents(): ReliabilityComponents {
  return {
    freshness: 0,
    completeness: 0,
    sampleSize: 0,
    sourceQuality: 0,
    consistency: 0,
    outlierSafety: 0,
  };
}

function rangeText(min: number | undefined, max: number | undefined) {
  if (min != null && max != null) return `${min}..${max}`;
  return min != null ? `>= ${min}` : `<= ${max}`;
}
