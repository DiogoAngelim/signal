import type { RealitySnapshot, RealitySnapshotInput } from "../types";
import { asScore, nowIso } from "../utils";

export function createRealitySnapshot(
  input: RealitySnapshotInput,
): RealitySnapshot {
  const source = normalizeSource(input.source);
  const createdAt = input.createdAt ?? nowIso();
  const snapshotId = input.snapshotId ?? `reality:${source}:${createdAt}`;

  return {
    snapshotId,
    source,
    createdAt,
    dataQuality: asScore(input.dataQuality, 75),
    freshnessScore: asScore(input.freshnessScore, 75),
    payload: input.payload,
    ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export function createRealitySnapshotForDecision(input: {
  decisionId: string;
  source?: string;
  createdAt?: string;
  observation: unknown;
  realitySnapshotId?: string;
  realitySnapshot?: RealitySnapshotInput | RealitySnapshot;
}): RealitySnapshot {
  if (input.realitySnapshot) {
    return createRealitySnapshot({
      ...input.realitySnapshot,
      snapshotId:
        input.realitySnapshot.snapshotId ??
        input.realitySnapshotId ??
        `reality:${input.decisionId}`,
      source: input.realitySnapshot.source ?? input.source ?? "signal",
      createdAt: input.realitySnapshot.createdAt ?? input.createdAt,
      payload: input.realitySnapshot.payload ?? input.observation,
    });
  }

  return createRealitySnapshot({
    snapshotId: input.realitySnapshotId ?? `reality:${input.decisionId}`,
    source: input.source ?? "signal",
    createdAt: input.createdAt,
    payload: input.observation,
    metadata: {
      decisionId: input.decisionId,
      capture: "derived-from-observation",
    },
  });
}

export function compactRealityPayload(
  payload: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(payload)) return { value: payload };
  const compacted: Record<string, unknown> = {};
  for (const key of keys) {
    if (payload[key] !== undefined) compacted[key] = payload[key];
  }
  return compacted;
}

function normalizeSource(source: string | undefined): string {
  const normalized = String(source ?? "").trim();
  return normalized || "signal";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
