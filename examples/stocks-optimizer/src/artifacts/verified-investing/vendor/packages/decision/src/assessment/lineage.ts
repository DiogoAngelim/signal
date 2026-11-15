import type {
  DecisionEvidence,
  DecisionEvidenceLineageAssessment,
} from "../types";

type RootResolution = {
  roots: Set<string>;
  complete: boolean;
};

export function assessEvidenceLineage(
  evidence: readonly DecisionEvidence[],
): DecisionEvidenceLineageAssessment {
  const evidenceById = new Map<string, DecisionEvidence>();
  const duplicateEvidenceIds = new Set<string>();

  for (const item of evidence) {
    if (evidenceById.has(item.evidenceId)) {
      duplicateEvidenceIds.add(item.evidenceId);
    } else {
      evidenceById.set(item.evidenceId, item);
    }
  }

  const missingDependencies = new Set<string>();
  const cycles = new Map<string, string[]>();
  const memo = new Map<string, RootResolution>();

  const resolveRoots = (
    evidenceId: string,
    ancestry: readonly string[] = [],
  ): RootResolution => {
    const cycleStart = ancestry.indexOf(evidenceId);
    if (cycleStart >= 0) {
      const cycle = [...ancestry.slice(cycleStart), evidenceId];
      const key = [...new Set(cycle)].sort().join("|");
      cycles.set(key, cycle);
      return { roots: new Set(), complete: false };
    }

    const cached = memo.get(evidenceId);
    if (cached) {
      return {
        roots: new Set(cached.roots),
        complete: cached.complete,
      };
    }

    const item = evidenceById.get(evidenceId);
    if (!item) {
      return { roots: new Set(), complete: false };
    }

    const dependencies = [...new Set(item.derivedFromEvidenceIds ?? [])];
    if (dependencies.length === 0) {
      const sourceId = item.sourceRef?.sourceId.trim();
      const result = {
        roots: new Set(sourceId ? [sourceId] : []),
        complete: Boolean(sourceId),
      };
      memo.set(evidenceId, result);
      return { roots: new Set(result.roots), complete: result.complete };
    }

    const roots = new Set<string>();
    let complete = true;
    for (const dependencyId of dependencies) {
      if (!evidenceById.has(dependencyId)) {
        missingDependencies.add(`${evidenceId}->${dependencyId}`);
        complete = false;
        continue;
      }

      const dependency = resolveRoots(dependencyId, [...ancestry, evidenceId]);
      for (const sourceId of dependency.roots) roots.add(sourceId);
      complete = complete && dependency.complete;
    }

    const result = { roots, complete: complete && roots.size > 0 };
    memo.set(evidenceId, result);
    return { roots: new Set(result.roots), complete: result.complete };
  };

  const rootSourceIdsByEvidence: Record<string, string[]> = {};
  const sharedRoots = new Map<string, Set<string>>();
  const allRootSources = new Set<string>();
  let completeEvidenceCount = 0;
  let sourceIdentityCount = 0;
  let derivedEvidenceCount = 0;

  for (const item of evidence) {
    const sourceId = item.sourceRef?.sourceId.trim();
    if (sourceId) sourceIdentityCount += 1;
    if ((item.derivedFromEvidenceIds ?? []).length > 0) {
      derivedEvidenceCount += 1;
    }

    const resolution = resolveRoots(item.evidenceId);
    const roots = [...resolution.roots].sort();
    rootSourceIdsByEvidence[item.evidenceId] = roots;
    if (resolution.complete) completeEvidenceCount += 1;

    for (const root of roots) {
      allRootSources.add(root);
      const group = sharedRoots.get(root) ?? new Set<string>();
      group.add(item.evidenceId);
      sharedRoots.set(root, group);
    }
  }

  const sourceIdentityCoverage = evidence.length
    ? Math.round((sourceIdentityCount / evidence.length) * 100)
    : 0;
  const lineageCoverage = evidence.length
    ? Math.round((completeEvidenceCount / evidence.length) * 100)
    : 0;
  const independentSourceCount = allRootSources.size;
  const sourceDiversityScore = evidence.length
    ? Math.min(100, Math.round((independentSourceCount / evidence.length) * 100))
    : 0;
  const duplicateIds = [...duplicateEvidenceIds].sort();
  const missing = [...missingDependencies].sort();
  const cycleList = [...cycles.values()];
  const sharedRootSourceGroups = [...sharedRoots.entries()]
    .filter(([, evidenceIds]) => evidenceIds.size > 1)
    .map(([sourceId, evidenceIds]) => ({
      sourceId,
      evidenceIds: [...evidenceIds].sort(),
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const status =
    duplicateIds.length > 0 || cycleList.length > 0
      ? "invalid"
      : evidence.length === 0 ||
          missing.length > 0 ||
          lineageCoverage < 100
        ? "incomplete"
        : "complete";

  const explanation = [
    `${independentSourceCount} independent root source(s) were traceable across ${evidence.length} evidence item(s).`,
    `Source identity coverage is ${sourceIdentityCoverage}/100 and lineage coverage is ${lineageCoverage}/100.`,
  ];
  if (sharedRootSourceGroups.length) {
    explanation.push(
      `${sharedRootSourceGroups.length} root source(s) support multiple evidence items; these items are not independent corroboration.`,
    );
  }
  if (missing.length) {
    explanation.push(`${missing.length} evidence dependency reference(s) are missing.`);
  }
  if (cycleList.length) {
    explanation.push(`${cycleList.length} evidence lineage cycle(s) were detected.`);
  }
  if (duplicateIds.length) {
    explanation.push(`${duplicateIds.length} duplicate evidence identifier(s) were detected.`);
  }
  if (evidence.length === 0) {
    explanation.push("No evidence was supplied for lineage assessment.");
  }

  return {
    status,
    sourceIdentityCoverage,
    lineageCoverage,
    sourceDiversityScore,
    independentSourceCount,
    derivedEvidenceCount,
    missingDependencies: missing,
    duplicateEvidenceIds: duplicateIds,
    cycles: cycleList,
    sharedRootSourceGroups,
    rootSourceIdsByEvidence,
    explanation,
  };
}
