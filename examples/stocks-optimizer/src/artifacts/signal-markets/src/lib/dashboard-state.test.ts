import { describe, expect, it } from "vitest";
import {
  type DashboardViewStateInput,
  resolveDashboardViewState,
} from "./dashboard-state";

const baseInput: DashboardViewStateInput = {
  selectedMarket: "US",
  isOnline: true,
  continueWithCachedData: false,
  initialLoading: false,
  refreshing: false,
  errorMessage: null,
  hasMarketData: true,
  qualifiedOpportunityCount: 3,
  cachedOpportunityCount: 3,
  cachedMarketItemCount: 500,
  cachedMarketLabel: "US",
  lastSuccessfulUpdateLabel: "12 seconds ago",
  missingTrustAnalysis: false,
};

describe("dashboard state resolver", () => {
  it("covers all explicit application states", () => {
    expect(
      resolveDashboardViewState({ ...baseInput, selectedMarket: "" }).kind,
    ).toBe("no-market");
    expect(
      resolveDashboardViewState({ ...baseInput, isOnline: false }).kind,
    ).toBe("connection-lost");
    expect(
      resolveDashboardViewState({
        ...baseInput,
        initialLoading: true,
        hasMarketData: false,
        cachedMarketItemCount: 0,
        cachedOpportunityCount: 0,
      }).kind,
    ).toBe("initial-loading");
    expect(
      resolveDashboardViewState({ ...baseInput, refreshing: true }).kind,
    ).toBe("refreshing");
    expect(
      resolveDashboardViewState({ ...baseInput, qualifiedOpportunityCount: 0 })
        .kind,
    ).toBe("empty-results");
    expect(
      resolveDashboardViewState({
        ...baseInput,
        errorMessage: "Failed to fetch market data.",
        hasMarketData: false,
        cachedMarketItemCount: 0,
        cachedOpportunityCount: 0,
      }).kind,
    ).toBe("error");
    expect(
      resolveDashboardViewState({ ...baseInput, missingTrustAnalysis: true })
        .kind,
    ).toBe("partial-data");
    expect(
      resolveDashboardViewState({ ...baseInput, staleData: true }).kind,
    ).toBe("stale-data");
    expect(resolveDashboardViewState(baseInput).kind).toBe("success");
  });

  it("allows cached data to remain usable after an offline acknowledgement", () => {
    const state = resolveDashboardViewState({
      ...baseInput,
      isOnline: false,
      continueWithCachedData: true,
    });

    expect(state.kind).toBe("success");
    expect(state.cachedMarketLabel).toBe("US");
    expect(state.cachedOpportunityCount).toBe(3);
  });

  it("uses recommendation-first wording for empty and partial states", () => {
    expect(
      resolveDashboardViewState({ ...baseInput, qualifiedOpportunityCount: 0 })
        .headline,
    ).toBe("Wait for better opportunities.");
    expect(
      resolveDashboardViewState({ ...baseInput, missingTrustAnalysis: true })
        .headline,
    ).toBe("Review ideas, but keep size small.");
    expect(
      resolveDashboardViewState({ ...baseInput, staleData: true }).headline,
    ).toBe("Review, but treat data as stale.");
  });
});
