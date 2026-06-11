import { describe, expect, it } from "vitest";
import { sizeDecision } from "../../../signal-framework";
import {
  assetSizingLabel,
  buildDashboardExposureSizing,
  financialExposureBandForSizingMode,
  requestedExposureForAsset,
  sizeAssetExposure,
  sizingModeLabelForOperator,
  sizingModeSentenceForOperator,
} from "./sizing";

describe("stocks optimizer sizing integration", () => {
  it("can consume generic Signal Sizing directly", () => {
    const result = sizeDecision({
      targetRef: "AAPL",
      confidence: 0.9,
      risk: 0.2,
      requestedCapacity: 10,
      availableCapacity: 20,
      maxCapacity: 20,
      constraints: [
        {
          id: "opportunity-density",
          type: "hard",
          passed: true,
          severity: "high",
        },
      ],
    });

    expect(result.decision).toBe("allowed");
    expect(result.size).toBeGreaterThan(0);
  });

  it("high confidence plus a blocked hard constraint returns none", () => {
    const result = sizeDecision({
      targetRef: "AAPL",
      confidence: 0.95,
      risk: 0.05,
      requestedCapacity: 10,
      availableCapacity: 10,
      constraints: [
        {
          id: "risk-gate",
          label: "Risk gate",
          type: "hard",
          passed: false,
          severity: "high",
          reason: "Risk gate prevents position sizing.",
        },
      ],
    });

    expect(result.decision).toBe("blocked");
    expect(result.mode).toBe("none");
    expect(result.size).toBe(0);
  });

  it("healthy market with low opportunity density explains zero exposure", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "NASDAQ",
      marketHealthPct: 78,
      opportunityDensityPct: 0,
      confidencePct: 82,
      riskPct: 28,
      requestedExposurePct: 0,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
    });

    expect(view.suggestedMaximumExposurePct).toBe(0);
    expect(view.limitedReason).toBe(
      "Market structure is healthy, but sizing is blocked because actionable opportunity density is too low or risk gates prevent position sizing.",
    );
    expect(view.operatorState.status).toBe("locked");
    expect(view.operatorState.sizingModeLabel).toBe("Sizing locked");
    expect(view.operatorState.portfolioCapLabel).toBe("No exposure");
    expect(
      view.sizingReasons.some((reason) =>
        reason.includes("Opportunity density"),
      ),
    ).toBe(true);
  });

  it("prioritizes strategy readiness when exposure is blocked by promotion gates", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "ADX",
      marketHealthPct: 90,
      opportunityDensityPct: 71,
      confidencePct: 83,
      riskPct: 15,
      requestedExposurePct: 25,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
      strategyBlocked: true,
    });

    expect(view.suggestedMaximumExposurePct).toBe(0);
    expect(view.limitedReason).toBe(
      "Strategy readiness gates block new exposure.",
    );
    expect(view.operatorState.status).toBe("locked");
    expect(view.operatorState.portfolioCapLabel).toBe("No exposure");
  });

  it("can explain calibration commitment gates without relabeling them as readiness failures", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "BINANCE",
      marketHealthPct: 74,
      opportunityDensityPct: 42,
      confidencePct: 66,
      riskPct: 5,
      requestedExposurePct: 5,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
      strategyBlocked: true,
      strategyBlockedLabel: "Calibration",
      strategyBlockedReason:
        "Calibration gates block new exposure until outcomes stabilize.",
    });

    expect(view.suggestedMaximumExposurePct).toBe(0);
    expect(view.limitedReason).toBe(
      "Calibration gates block new exposure until outcomes stabilize.",
    );
    expect(
      view.sizingConstraints.some(
        (constraint) => constraint.label === "Calibration",
      ),
    ).toBe(true);
  });

  it("keeps raw none sizing structural while exposing operator-safe labels", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "BINANCE",
      marketHealthPct: 93,
      opportunityDensityPct: 43,
      confidencePct: 34,
      riskPct: 7,
      requestedExposurePct: 0,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
      strategyBlocked: true,
      strategyBlockedLabel: "Survival memory scar",
      strategyBlockedReason:
        "Survival Memory requires proof before sizing can reopen.",
    });

    expect(view.sizingMode).toBe("none");
    expect(view.suggestedMaximumExposurePct).toBe(0);
    expect(view.operatorState.status).toBe("locked");
    expect(view.operatorState.sizingModeLabel).toBe("Sizing locked");
    expect(view.operatorState.portfolioCapLabel).toBe("No exposure");
    expect(sizingModeLabelForOperator(view.sizingMode)).toBe("Sizing locked");
    expect(sizingModeSentenceForOperator(view.sizingMode)).toBe("locked");
  });

  it("mature candidate receives non-zero sizing when constraints pass", () => {
    const view = sizeAssetExposure({
      targetRef: "MSFT",
      signalAction: "Buy",
      signalStatus: "confirmed",
      setupQuality: 84,
      riskPressure: 24,
      trendQuality: 80,
      timingQuality: 78,
      expectedMove: 3.2,
      requestedExposurePct: 5,
      maxExposurePct: 6,
      hasEvidence: true,
    });

    expect(view.sizingDecision).toBe("allowed");
    expect(view.suggestedExposurePct).toBeGreaterThan(0);
    expect(
      assetSizingLabel({
        allocationAction: "Buy",
        suggestedExposure: view.suggestedExposurePct,
        setupQuality: 84,
        sizingMode: view.sizingMode,
      }),
    ).toBe("Mature");
  });

  it("derives requested exposure for explicit buy ideas with zero upstream exposure", () => {
    const requestedExposurePct = requestedExposureForAsset({
      signalAction: "Buy",
      allocationAction: "Buy",
      suggestedExposurePct: 0,
      setupQuality: 100,
      riskPressure: 7,
      maxExposurePct: 5.5,
    });

    expect(requestedExposurePct).toBeGreaterThan(0);
    expect(requestedExposurePct).toBeLessThanOrEqual(5.5);
  });

  it("does not synthesize exposure for app-level watch actions", () => {
    const requestedExposurePct = requestedExposureForAsset({
      signalAction: "Buy",
      allocationAction: "Watch",
      suggestedExposurePct: 0,
      setupQuality: 100,
      riskPressure: 7,
      maxExposurePct: 5.5,
    });

    expect(requestedExposurePct).toBe(0);
  });

  it("sizing reasons are surfaced in the dashboard model", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "ADX",
      marketHealthPct: 42,
      opportunityDensityPct: 18,
      confidencePct: 45,
      riskPct: 52,
      requestedExposurePct: 8,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
    });

    expect(view.sizingReasons.length).toBeGreaterThan(0);
    expect(view.limitedReason.length).toBeGreaterThan(0);
  });

  it("explains requested-cap limits in portfolio exposure terms", () => {
    const view = buildDashboardExposureSizing({
      marketRef: "BINANCE",
      marketHealthPct: 76,
      opportunityDensityPct: 38,
      confidencePct: 69,
      riskPct: 8,
      requestedExposurePct: 2,
      strategyCapPct: 65,
      hasMarketData: true,
      hasProvidedSignals: true,
    });

    expect(view.suggestedMaximumExposurePct).toBe(2);
    expect(view.limitedReason).toBe(
      "Portfolio exposure is capped by requested capacity at 2.0%.",
    );
  });

  it("financial exposure mapping stays outside the Signal Sizing result", () => {
    const signalSizing = sizeDecision({
      targetRef: "portfolio",
      confidence: 0.9,
      risk: 0.1,
      requestedCapacity: 100,
      availableCapacity: 100,
    });
    const financialBand = financialExposureBandForSizingMode(
      signalSizing.mode,
      65,
    );

    expect("suggestedExposurePct" in (signalSizing as any)).toBe(false);
    expect(financialBand.maxPct).toBeLessThanOrEqual(65);
  });
});
