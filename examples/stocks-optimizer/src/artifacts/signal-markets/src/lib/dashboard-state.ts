export type DashboardViewStateKind =
  | "no-market"
  | "connection-lost"
  | "initial-loading"
  | "refreshing"
  | "empty-results"
  | "error"
  | "partial-data"
  | "stale-data"
  | "success";

export type DashboardViewState = {
  kind: DashboardViewStateKind;
  headline: string;
  description: string;
  lastSuccessfulUpdateLabel: string;
  cachedMarketLabel: string;
  cachedOpportunityCount: number;
  cachedMarketItemCount: number;
  errorMessage?: string | null;
};

export type DashboardViewStateInput = {
  selectedMarket?: string | null;
  isOnline: boolean;
  continueWithCachedData?: boolean;
  initialLoading: boolean;
  refreshing: boolean;
  errorMessage?: string | null;
  hasMarketData: boolean;
  qualifiedOpportunityCount: number;
  cachedOpportunityCount: number;
  cachedMarketItemCount: number;
  cachedMarketLabel?: string | null;
  lastSuccessfulUpdateLabel?: string | null;
  missingTrustAnalysis?: boolean;
  staleData?: boolean;
};

function baseState(
  kind: DashboardViewStateKind,
  input: DashboardViewStateInput,
  copy: Pick<DashboardViewState, "headline" | "description">,
): DashboardViewState {
  return {
    kind,
    headline: copy.headline,
    description: copy.description,
    lastSuccessfulUpdateLabel: input.lastSuccessfulUpdateLabel || "Not synced",
    cachedMarketLabel: input.cachedMarketLabel || "No cached market",
    cachedOpportunityCount: Math.max(
      0,
      Math.round(input.cachedOpportunityCount || 0),
    ),
    cachedMarketItemCount: Math.max(
      0,
      Math.round(input.cachedMarketItemCount || 0),
    ),
    errorMessage: input.errorMessage ?? null,
  };
}

export function resolveDashboardViewState(
  input: DashboardViewStateInput,
): DashboardViewState {
  if (!input.selectedMarket) {
    return baseState("no-market", input, {
      headline: "What would you like to explore today?",
      description:
        "Choose what you care about first. Signal will build the context after that.",
    });
  }

  const hasCachedData =
    input.cachedMarketItemCount > 0 ||
    input.cachedOpportunityCount > 0 ||
    input.hasMarketData;

  if (!input.isOnline && !input.continueWithCachedData) {
    return baseState("connection-lost", input, {
      headline: "Use cached data or retry.",
      description:
        "Live decisions should stay paused until market data reconnects. You can retry now or continue with cached context.",
    });
  }

  if (input.initialLoading && !hasCachedData) {
    return baseState("initial-loading", input, {
      headline: "Checking current conditions.",
      description:
        "Signal is checking prices, signals, and caution levels before suggesting an action.",
    });
  }

  if (input.errorMessage && !input.hasMarketData && !hasCachedData) {
    return baseState("error", input, {
      headline: "Retry before making a decision.",
      description:
        "Signal could not retrieve market information. Keep capital flat until a fresh update succeeds.",
    });
  }

  if (
    input.hasMarketData &&
    !input.initialLoading &&
    input.qualifiedOpportunityCount === 0
  ) {
    return baseState("empty-results", input, {
      headline: "Wait for better opportunities.",
      description:
        "Nothing clears the quality threshold right now. Staying selective is the recommended action.",
    });
  }

  if (input.missingTrustAnalysis) {
    return baseState("partial-data", input, {
      headline: "Review ideas, but keep size small.",
      description:
        "Opportunity analysis is available, but reliability evidence is incomplete. Wait for a fresh reliability update before increasing allocation.",
    });
  }

  if (input.staleData) {
    return baseState("stale-data", input, {
      headline: "Review, but treat data as stale.",
      description: `Last successful update: ${input.lastSuccessfulUpdateLabel || "Not synced"}. Refresh before increasing allocation.`,
    });
  }

  if (input.refreshing) {
    return baseState("refreshing", input, {
      headline: "Keep the current action while data updates.",
      description: `Last successful update: ${input.lastSuccessfulUpdateLabel || "Not synced"}.`,
    });
  }

  return baseState("success", input, {
    headline: "Start with the recommendation.",
    description:
      "Signal has enough current context to explain the action, the reason, and the next check.",
  });
}
