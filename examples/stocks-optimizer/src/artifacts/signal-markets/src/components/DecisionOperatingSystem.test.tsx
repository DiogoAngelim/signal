import type { DashboardViewState } from "@/lib/dashboard-state";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DecisionOperatingSystem, {
  type DecisionOperatingSystemProps,
} from "./DecisionOperatingSystem";

const successState: DashboardViewState = {
  kind: "success",
  headline: "Start with the recommendation.",
  description:
    "Signal has enough market context to explain the action, the reason, and the next check.",
  lastSuccessfulUpdateLabel: "12 seconds ago",
  cachedMarketLabel: "US",
  cachedOpportunityCount: 1,
  cachedMarketItemCount: 500,
};

function props(
  overrides: Partial<DecisionOperatingSystemProps> = {},
): DecisionOperatingSystemProps {
  return {
    state: successState,
    marketOptions: [
      { value: "US", label: "Stocks" },
      { value: "BINANCE", label: "Binance" },
      { value: "ETF", label: "ETFs" },
    ],
    selectedMarket: "US",
    onMarketChange: vi.fn(),
    onRefresh: vi.fn(),
    onContinueUsingCachedData: vi.fn(),
    refreshing: false,
    refreshError: null,
    marketState: "Constructive Trend Environment",
    marketStatus: "Venue open",
    lastSyncedLabel: "12 seconds ago",
    readinessPct: 72,
    readinessState: "Ready",
    readinessTone: "good",
    bestOpportunityLabel: "AAPL",
    recommendedAction: "Review",
    suggestedExposure: "2%",
    mainRisk: "No active limiter",
    missingEvidence: "fresh confirmation",
    executiveNarrative: "The market has enough evidence for review.",
    readinessWhy: "The evidence ladder supports a cautious review.",
    readinessImprover: "More fresh signals improve conviction.",
    readinessBlocker: "No hard blocker is currently promoted.",
    opportunities: [
      {
        id: "AAPL",
        ticker: "AAPL",
        name: "Apple",
        action: "Review",
        readinessPct: 74,
        exposureLabel: "2%",
        maxExposureLabel: "2%",
        qualityPct: 82,
        trustPct: 76,
        riskPct: 34,
        timingPct: 71,
        thesis: "AAPL is the clearest opportunity to review.",
        context: "Trend and risk are aligned enough for a cautious review.",
        support: ["Trend quality supports continued review."],
        contradictions: ["No promoted contradiction."],
        missing: ["fresh confirmation"],
        invalidations: ["Invalidate if breadth collapses."],
        drivers: ["Quality 82%"],
      },
    ],
    selectedOpportunityId: "AAPL",
    onSelectOpportunity: vi.fn(),
    evidenceLadder: [
      {
        id: "market",
        label: "Market Context",
        status: "Pass",
        explanation: "Market health is constructive.",
      },
      {
        id: "trust",
        label: "Trust",
        status: "Caution",
        explanation: "Trust is still being confirmed.",
      },
    ],
    workflow: [
      {
        id: "opportunity",
        label: "Opportunity",
        question: "What deserves attention?",
        output: "AAPL leads the ranked list.",
        detail: "AAPL is ranked by quality and risk.",
        status: "1 ranked",
      },
      {
        id: "trust",
        label: "Trust",
        question: "Can I trust it?",
        output: "Trust is explainable.",
        detail: "Evidence is mixed.",
        status: "Trust report",
      },
      {
        id: "size",
        label: "Size",
        question: "How much should I risk?",
        output: "2%",
        detail: "Use small size.",
        status: "Micro",
      },
      {
        id: "action",
        label: "Action",
        question: "What exactly should I do?",
        output: "Review",
        detail: "Review AAPL.",
        status: "Review",
      },
    ],
    actionPlan: {
      asset: "AAPL",
      direction: "Review",
      exposure: "2%",
      entryLogic: "Wait for fresh confirmation before changing exposure.",
      riskConstraints: "Do not exceed 2%.",
      exitConditions: "Exit if breadth collapses.",
      invalidation: "Invalidate if breadth collapses.",
      portfolioImpact: "Portfolio cap 2%.",
      nextAction: "Review",
    },
    rawMetrics: [
      { label: "Confidence", value: "72%" },
      { label: "Trust", value: "76%" },
      { label: "Market Health", value: "74%" },
      { label: "Opportunity Density", value: "42%" },
      { label: "Risk Pressure", value: "34%" },
      { label: "Readiness", value: "72%" },
      { label: "Starter Size", value: "2%" },
      { label: "Portfolio Cap", value: "2%" },
      { label: "Survival", value: "70%" },
      { label: "Calibration", value: "73%" },
      { label: "History Depth", value: "80%" },
    ],
    ...overrides,
  };
}

describe("DecisionOperatingSystem states", () => {
  it("renders the normal success shell without changing workflow structure", () => {
    const html = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);

    expect(html).toContain('data-state-kind="success"');
    expect(html).toContain('data-testid="decision-step-screen"');
    expect(html).toContain("What decision is being made?");
    expect(html).toContain("Intent");
    expect(html).toContain("Sense");
    expect(html).toContain("Pulse");
    expect(html).toContain("Core");
    expect(html).toContain("Judgement");
    expect(html).toContain("Sizing");
    expect(html).toContain("Action");
    expect(html).toContain("Reflection");
    expect(html).toContain("Decision readiness");
    expect(html).toContain("Recommended action");
    expect(html).toContain("Current step");
    expect(html).toContain("Decision summary");
    expect(html).toContain("Trust summary");
    expect(html).toContain("Evidence summary");
    expect(html).toContain("Supporting numbers");
    expect(html).toContain(
      "The system has enough conviction to support the recommendation.",
    );
    expect(html).toContain("Opportunity review");
  });

  it("translates internal terms before they reach the default decision surface", () => {
    const html = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          mainRisk: "Governance blocker",
          readinessWhy:
            "Discovery and Agency calibration are still being checked.",
          evidenceLadder: [
            {
              id: "internal",
              label: "Governance Calibration",
              status: "Caution",
              explanation: "Discovery and Recovery need Agency confirmation.",
            },
          ],
        })}
      />,
    );

    expect(html).toContain("safety review blocker");
    expect(html).toContain(
      "opportunity search and decision control recent reliability are still being checked.",
    );
    expect(html).toContain(
      "opportunity search and return to normal size need decision control confirmation.",
    );
    expect(html).not.toContain("Governance");
    expect(html).not.toContain("Calibration");
    expect(html).not.toContain("Discovery");
    expect(html).not.toContain("Agency");
    expect(html).not.toContain("Recovery");
  });

  it("renders the guided no-market state with required actions", () => {
    const html = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "no-market",
            headline: "Select a market first.",
            description:
              "Choose a market so Signal can recommend what to do next.",
            cachedMarketLabel: "No market selected",
            cachedOpportunityCount: 0,
            cachedMarketItemCount: 0,
          },
          selectedMarket: "",
        })}
      />,
    );

    expect(html).toContain('data-state-kind="no-market"');
    expect(html).toContain("Select a market first.");
    expect(html).toContain("Binance");
    expect(html).toContain("Stocks");
    expect(html).toContain("ETFs");
    expect(html).toContain("Forex");
    expect(html).toContain("Futures");
    expect(html).toContain("Learn How Signal Works");
    expect(html).not.toContain('data-testid="decision-step-screen"');
  });

  it("declares one bounded scroll strategy for the shell, tabs, cards, lists, and action row", () => {
    const html = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);

    expect(html).toContain('data-overflow-policy="contained-app-shell"');
    expect(html).toContain('data-testid="decision-main-scroll"');
    expect(html).toContain('data-overflow-policy="horizontal-tabs"');
    expect(html).toContain('data-testid="workflow-tab-list"');
    expect(html).toContain('data-overflow-policy="card-body-scroll"');
    expect(html).toContain('data-overflow-policy="opportunity-list-scroll"');
    expect(html).toContain('data-overflow-policy="bounded-opportunity-panel"');
    expect(html).toContain('data-overflow-policy="sticky-primary-action"');
    expect(html).toContain("h-dvh");
    expect(html).toContain("overflow-x-hidden");
    expect(
      html.match(/data-overflow-policy="card-body-scroll"/g)?.length,
    ).toBe(4);
  });

  it("keeps long labels and many opportunities inside scrollable regions", () => {
    const longText =
      "Extremely Long Opportunity Name With Many Words And No Useful Short Alias For A Narrow Viewport";
    const manyOpportunities = Array.from({ length: 12 }, (_, index) => ({
      ...props().opportunities[0],
      id: `LONG-${index}`,
      ticker: `LONG-TICKER-${index}`,
      name: `${longText} ${index}`,
      thesis: `${longText} should remain readable without forcing the page wider.`,
      context: `${longText} has a long explanation that should scroll inside the designed panel instead of escaping the card.`,
      support: [`${longText} support detail ${index}`],
      contradictions: [`${longText} risk detail ${index}`],
      missing: [`${longText} missing confirmation ${index}`],
      invalidations: [`${longText} invalidation ${index}`],
      drivers: [`${longText} driver ${index}`],
    }));

    const html = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          marketOptions: [
            {
              value: "VERY-LONG-MARKET-CODE-WITHOUT-BREAKPOINTS",
              label: "Very Long Market Name That Should Not Stretch Header",
            },
            ...props().marketOptions,
          ],
          selectedMarket: "VERY-LONG-MARKET-CODE-WITHOUT-BREAKPOINTS",
          opportunities: manyOpportunities,
          selectedOpportunityId: "LONG-0",
          bestOpportunityLabel: "LONG-TICKER-0",
          mainRisk: longText,
          readinessWhy: `${longText} because the explanation is intentionally verbose.`,
          missingEvidence: `${longText} confirmation`,
        })}
      />,
    );

    expect(html).toContain(longText);
    expect(html).toContain('data-overflow-policy="opportunity-list-scroll"');
    expect(html).toContain("max-h-[22rem]");
    expect(html).toContain("break-words");
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("min-w-[760px]");
  });

  it("keeps blocking-state actions sticky when empty, error, or first-run content grows", () => {
    const html = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "no-market",
            headline: "Select a market first.",
            description:
              "Choose a market so Signal can recommend what to do next.",
            cachedMarketLabel:
              "Very Long Cached Market Label That Should Wrap Inside The Tile",
            cachedOpportunityCount: 0,
            cachedMarketItemCount: 0,
          },
          selectedMarket: "",
        })}
      />,
    );

    expect(html).toContain('data-scroll-region="blocking-state"');
    expect(html).toContain('data-overflow-policy="sticky-state-actions"');
    expect(html).toContain("Select Market");
    expect(html).toContain("sticky bottom-2");
  });

  it("renders connection, empty, error, partial, refresh, and loading states", () => {
    const connection = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "connection-lost",
            headline: "Use cached data or retry.",
            description:
              "Live decisions should stay paused until market data reconnects. You can retry now or continue with cached context.",
          },
        })}
      />,
    );
    expect(connection).toContain("Retry Connection");
    expect(connection).toContain("Continue Using Cached Data");

    const empty = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "empty-results",
            headline: "Wait for better opportunities.",
            description:
              "Nothing clears the quality threshold right now. Staying selective is the recommended action.",
            cachedOpportunityCount: 0,
          },
          opportunities: [],
          selectedOpportunityId: null,
        })}
      />,
    );
    expect(empty).toContain("Wait for better opportunities.");
    expect(empty).toContain("Wait for new opportunities");
    expect(empty).toContain("Change market");
    expect(empty).toContain("Adjust filters");

    const error = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "error",
            headline: "Retry before making a decision.",
            description:
              "Signal could not retrieve market information. Keep capital flat until a fresh update succeeds.",
          },
        })}
      />,
    );
    expect(error).toContain("Retry before making a decision.");
    expect(error).not.toContain("Failed to fetch");

    const partial = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "partial-data",
            headline: "Review ideas, but keep size small.",
            description:
              "Opportunity analysis is available, but reliability evidence is incomplete. Wait for a fresh trust update before increasing exposure.",
          },
        })}
      />,
    );
    expect(partial).toContain("Review ideas, but keep size small.");
    expect(partial).toContain('data-testid="decision-step-screen"');

    const refreshing = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "refreshing",
            headline: "Keep the current action while data updates.",
            description: "Last successful update: 12 seconds ago.",
          },
          refreshing: true,
        })}
      />,
    );
    expect(refreshing).toContain("Keep the current action while data updates.");
    expect(refreshing).toContain("Last successful update: 12 seconds ago.");

    const loading = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "initial-loading",
            headline: "Wait for market evidence.",
            description:
              "Signal is checking prices, signals, and risk before recommending an action.",
          },
        })}
      />,
    );
    expect(loading).toContain('data-state-kind="initial-loading"');
    expect(loading).not.toContain("Loading...");
  });
});
