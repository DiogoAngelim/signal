import { describe, expect, it } from "vitest";
import {
  buildCalibrationState,
  classifyMarketRegime,
  decideMetaAllocation,
  forecastSignalSurvival,
  type DiagnosticInputs,
} from "./metaAllocation";

const baseDiagnostics: DiagnosticInputs = {
  trendQuality: 66,
  reliability: 68,
  breadth: 64,
  clarity: 62,
  calibration: 72,
  volatilityPressure: 38,
  regimeStability: 70,
  modelDurability: 74,
  holdingQuality: 70,
  errorControl: 72,
  survivalProbability: 70,
  residualInstability: 24,
  entropy: 36,
  drift: 28,
};

function decisionFor(diagnostics: DiagnosticInputs) {
  const calibrationState = buildCalibrationState([
    { predictedProbability: 0.62, realizedOutcomeQuality: 0.64 },
    { predictedProbability: 0.7, realizedOutcomeQuality: 0.72 },
    { predictedProbability: 0.58, realizedOutcomeQuality: 0.55 },
    { predictedProbability: 0.75, realizedOutcomeQuality: 0.76 },
    { predictedProbability: 0.48, realizedOutcomeQuality: 0.5 },
    { predictedProbability: 0.67, realizedOutcomeQuality: 0.65 },
    { predictedProbability: 0.82, realizedOutcomeQuality: 0.78 },
    { predictedProbability: 0.54, realizedOutcomeQuality: 0.57 },
  ]);
  const regime = classifyMarketRegime(diagnostics);
  const survival = forecastSignalSurvival({ diagnostics, signalAgeMinutes: 18 });
  return decideMetaAllocation({ diagnostics, calibrationState, regime, survival });
}

describe("meta allocation governors", () => {
  it("reduces confidence when calibration is weak", () => {
    const weakCalibration = buildCalibrationState([
      { predictedProbability: 0.9, realizedOutcomeQuality: 0.2 },
      { predictedProbability: 0.85, realizedOutcomeQuality: 0.25 },
      { predictedProbability: 0.8, realizedOutcomeQuality: 0.3 },
      { predictedProbability: 0.75, realizedOutcomeQuality: 0.2 },
      { predictedProbability: 0.7, realizedOutcomeQuality: 0.28 },
      { predictedProbability: 0.88, realizedOutcomeQuality: 0.32 },
      { predictedProbability: 0.78, realizedOutcomeQuality: 0.22 },
      { predictedProbability: 0.92, realizedOutcomeQuality: 0.35 },
    ]);
    const goodCalibration = buildCalibrationState([
      { predictedProbability: 0.62, realizedOutcomeQuality: 0.61 },
      { predictedProbability: 0.7, realizedOutcomeQuality: 0.71 },
      { predictedProbability: 0.4, realizedOutcomeQuality: 0.39 },
      { predictedProbability: 0.82, realizedOutcomeQuality: 0.8 },
      { predictedProbability: 0.55, realizedOutcomeQuality: 0.57 },
      { predictedProbability: 0.68, realizedOutcomeQuality: 0.66 },
      { predictedProbability: 0.74, realizedOutcomeQuality: 0.73 },
      { predictedProbability: 0.5, realizedOutcomeQuality: 0.52 },
    ]);

    const regime = classifyMarketRegime(baseDiagnostics);
    const survival = forecastSignalSurvival({ diagnostics: baseDiagnostics });

    expect(decideMetaAllocation({ diagnostics: baseDiagnostics, calibrationState: weakCalibration, regime, survival }).confidenceDiscount)
      .toBeLessThan(decideMetaAllocation({ diagnostics: baseDiagnostics, calibrationState: goodCalibration, regime, survival }).confidenceDiscount);
  });

  it("reduces exposure under high entropy", () => {
    const calm = decisionFor({ ...baseDiagnostics, entropy: 34 });
    const noisy = decisionFor({ ...baseDiagnostics, entropy: 84 });

    expect(noisy.exposureMultiplier).toBeLessThan(calm.exposureMultiplier);
  });

  it("extends holding duration when regime stability is high", () => {
    const unstable = decisionFor({ ...baseDiagnostics, regimeStability: 30, drift: 62 });
    const stable = decisionFor({ ...baseDiagnostics, regimeStability: 84, drift: 26 });

    expect(stable.holdingPeriodMultiplier).toBeGreaterThan(unstable.holdingPeriodMultiplier);
  });

  it("shortens holding horizon when survival is low", () => {
    const durable = forecastSignalSurvival({ diagnostics: baseDiagnostics });
    const fragile = forecastSignalSurvival({
      diagnostics: {
        ...baseDiagnostics,
        holdingQuality: 20,
        modelDurability: 22,
        survivalProbability: 20,
        residualInstability: 78,
        volatilityPressure: 80,
      },
      signalAgeMinutes: 90,
      recentSignalReversals: 2,
    });

    expect(fragile.recommendedHoldingMinutes).toBeLessThan(durable.recommendedHoldingMinutes);
  });

  it("uses conservative defaults when diagnostics are missing", () => {
    const sparse = decisionFor({});
    const complete = decisionFor(baseDiagnostics);

    expect(sparse.exposureMultiplier).toBeLessThan(complete.exposureMultiplier);
    expect(sparse.allocationCap).toBeLessThan(complete.allocationCap);
  });

  it("does not increase allocation from dashboard KPI strength alone", () => {
    const clean = decisionFor(baseDiagnostics);
    const gamedProxy = decisionFor({
      ...baseDiagnostics,
      trendQuality: 95,
      reliability: 95,
      breadth: 95,
      clarity: 95,
      calibration: 95,
      entropy: 88,
      drift: 82,
      residualInstability: 84,
      survivalProbability: 30,
    });

    expect(gamedProxy.exposureMultiplier).toBeLessThan(clean.exposureMultiplier);
  });
});
