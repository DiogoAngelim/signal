# Signal Pruning

Pruning is Signal's restraint layer. It decides what should be kept, reduced,
isolated, quarantined, ignored, or reviewed before weak evidence can inflate a
decision.

Pruning is generic. It does not know about trading, markets, portfolios, or any
application domain. Adapters translate local data into pruning candidates.

## Ignorance Effectiveness

Ignorance effectiveness measures whether Signal ignores exactly what deserves to
be ignored while preserving useful or survival-critical evidence.

Pruning never asks whether a candidate can predict something in isolation. It
asks whether the candidate improves decisions after accounting for:

- utility and decision contribution
- evidence quality, sample size, freshness, and regime stability
- redundancy, noise, overfit risk, contradiction, and stale data
- complexity, maintenance, latency, and frontend clarity cost
- survival value and governance flags

## Inputs

Each `PruningCandidateInput` may describe a raw signal, derived metric, module
output, rule, policy, explanation, recommendation contributor, scoring input,
historical pattern, or frontend insight.

Inputs are intentionally nullable. Missing, stale, partial, and degraded data
produce `degradedMode`, `missingInputs`, warnings, and conservative actions
instead of crashes or false confidence.

Identity fields:

- `candidateId`
- `candidateType`
- `sourceModule`

Core score fields:

- utility: `historicalUtility`, `predictiveContribution`,
  `decisionContribution`, `recentOutcomeImpact`, `counterfactualImpact`
- risk: `redundancyScore`, `noiseScore`, `volatilitySensitivity`,
  `staleDataRisk`, `contradictionRate`, `falsePositiveRate`,
  `falseNegativeRate`, `overfitRisk`, `uncertainty`
- evidence: `evidenceQuality`, `sampleSize`, `regimeStability`
- cost: `complexityCost`, `maintenanceCost`, `latencyCost`,
  `userClarityCost`
- protection: `survivalValue`, `explainabilityValue`, `governanceFlags`,
  `selfModelWarnings`, `confidenceImpact`, `trustImpact`

`validatePruningCandidate` reports schema issues. `evaluatePruning` safely
degrades by default; `strictValidation: true` throws `PruningValidationError`
for invalid identity or non-numeric score data.

## Outputs

Every assessment includes:

- `pruningScore`
- `ignoranceEffectivenessScore`
- `keepScore`, `ignoreScore`, `reduceScore`, `quarantineScore`
- `redundancyPenalty`, `complexityPenalty`, `overfitPenalty`, `noisePenalty`,
  `clarityPenalty`
- `survivalContribution`, `utilityContribution`, `evidenceConfidence`
- `recommendedAction`
- `reason`, `explanation`, `warnings`, `missingInputs`, `degradedMode`
- `trace`, `contributingFactors`, `opposingFactors`

The aggregate result also exposes app-friendly arrays:

- `ignoredSignals`
- `reducedSignals`
- `quarantinedSignals`
- `preservedSignals`
- `survivalCriticalSignals`
- `frontendHiddenSignals`

## Scoring Rules

The scoring weights live in `PRUNING_SCORING_WEIGHTS`. They are deterministic,
explicit, bounded to 0-100, and covered by tests.

Rules:

- Useful but redundant evidence is reduced, marked redundant, and preserved as
  backup evidence.
- High-noise, low-utility evidence is ignored when evidence is strong enough.
- Overfit or contradictory evidence is quarantined until cross-regime validation
  restores trust.
- Weak evidence cannot raise confidence and usually becomes review or isolate.
- Complexity without decision value creates pruning pressure.
- Survival-critical evidence is kept unless the evidence against it is extremely
  strong.
- Frontend-confusing evidence can be hidden from the primary UI while staying
  available internally.
- Unknown value is reviewed rather than over-pruned.

## Integration

The core engine evaluates pruning after recognition and before agency. Agency
receives pruning output and blocks or caps execution when decisions depend on
ignored or quarantined drivers.

Wisdom consumes pruning output through `evaluateDecisionQuality`. It adjusts:

- `justifiedConfidence`
- `falseConfidenceRisk`
- `robustnessScore`
- `antifragilityScore`
- `recommendedAction`
- `survivalAdjustment`

Application adapters decide what local data means. The stocks optimizer adapter
maps market-specific trade signals and dashboard insights into generic pruning
candidates, then exposes a stable optional view model with legacy, enhanced, and
degraded modes.

## Examples

1. A noisy low-utility signal is ignored and `ignoredSignals` includes the
   candidate id.
2. A redundant but useful signal is reduced and kept as backup evidence.
3. A survival-critical warning is preserved even when it hurts short-term
   performance.
4. A confusing frontend metric is hidden from the main view but remains in audit
   output.
5. A profitable but overfit historical pattern is quarantined pending
   cross-regime validation.
6. A low-evidence signal is sent to review or isolated so it cannot dominate a
   decision.

## Storage

Storage is interface-based:

- `PruningStore`
- `SignalUtilityStore`
- `CandidateHistoryStore`
- `PruningTraceStore`

`InMemoryPruningStore` is provided for tests and lightweight in-process use. No
database is hardcoded.

## Testing Strategy

Tests cover the main decision rules, validation fallback, deterministic
property-style samples, bounded scores, Signal pipeline integration, Agency
blocking, Wisdom confidence adjustment, and the stocks optimizer view model.
