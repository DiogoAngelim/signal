// @vitest-environment happy-dom

import type { DashboardViewState } from "@/lib/dashboard-state";
import {
  parseDashboardMarketOptions,
  parseDashboardQuoteBatchResponse,
  parseDashboardStockListResponse,
} from "@/lib/dashboard-data-adapter";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DecisionOperatingSystem, {
  type DecisionOperatingSystemProps,
} from "./DecisionOperatingSystem";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const successState: DashboardViewState = {
  kind: "success",
  headline: "Start with the recommendation.",
  description:
    "Signal has enough current context to explain the action, the reason, and the next check.",
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
        learning: {
          thesis: {
            title: "AAPL Review thesis",
            description: "AAPL is being evaluated because evidence supports a measured review.",
            status: "strengthening",
            confidence: 74,
          },
          evidence: {
            supporting: [{ description: "Trend quality supports continued review." }],
            contradicting: [],
            missing: ["fresh confirmation"],
            invalidationConditions: ["Invalidate if breadth collapses."],
          },
          similarRegimes: [],
          mindChangeTriggers: [
            {
              label: "Breadth weakens",
              reason: "Market participation below 40 would weaken the view.",
            },
          ],
          conviction: {
            confidence: 72,
            trust: 76,
            conviction: 73,
            explanation: "Conviction is separated from readiness.",
          },
          readiness: {
            readiness: 74,
            actionLanguage: "act-small",
            explanation: "Readiness, not confidence alone, drives action language.",
          },
          calibration: {
            calibrationScore: 73,
            reliabilityTrend: "aligned",
            sampleSize: 4,
            explanation: "Confidence has matched reviewed outcomes closely enough.",
          },
          processQuality: {
            processQualityScore: 78,
            outcomeQualityScore: null,
            readinessScore: 74,
            learningNote: "Process quality will become clearer after the decision has a reviewed outcome.",
          },
          beliefFreshness: {
            freshness: 92,
            status: "fresh",
            confidenceAfterDecay: 74,
            explanation: "This thesis has fresh evidence.",
          },
          horizons: [
            { horizon: "short-term", view: "constructive", action: "Review", confidence: 72 },
            { horizon: "medium-term", view: "neutral", action: "Track", confidence: 70 },
            { horizon: "long-term", view: "cautious", action: "Stay measured", confidence: 68 },
          ],
          opportunityRanking: {
            bestOpportunity: { label: "AAPL" },
            otherOpportunities: [],
            notReadyYet: [],
            explanation: "AAPL ranks above alternatives because readiness is strongest.",
          },
          portfolioContext: {
            summary: "Portfolio context is unavailable; Signal is evaluating standalone evidence only.",
            warnings: [],
          },
          narrative: {
            action: "Review; readiness says act small.",
            whatChanged: "Similar regimes will appear after more snapshots are collected.",
            whatIsHappening: "AAPL has the clearest current thesis.",
            whyItMatters: "AAPL ranks above alternatives.",
            uncertainty: "fresh confirmation",
            mindChange: "Market participation below 40 would weaken the view.",
          },
          learningRecords: [],
          emptyStates: [
            "No previous decisions have been reviewed yet.",
            "Similar regimes will appear after more snapshots are collected.",
            "No contradicting evidence has been found yet.",
            "Outcome learning starts after decisions are reviewed.",
          ],
        },
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
      { label: "Conviction", value: "73%" },
      { label: "Market Health", value: "74%" },
      { label: "Opportunity Density", value: "42%" },
      { label: "Risk Pressure", value: "34%" },
      { label: "Readiness", value: "72%" },
      { label: "Decision Readiness", value: "74%" },
      { label: "Portfolio Contribution", value: "Pending" },
      { label: "Similar Regimes", value: "0" },
      { label: "Starter Size", value: "2%" },
      { label: "Portfolio Cap", value: "2%" },
      { label: "Survival", value: "70%" },
      { label: "Calibration", value: "73%" },
      { label: "History Depth", value: "80%" },
    ],
    ...overrides,
  };
}

function renderInteractive(
  component: ReactElement,
): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(component);
  });

  return {
    container,
    cleanup: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

function stepButton(container: HTMLElement, stepId: string) {
  return container.querySelector(
    `[data-testid="workflow-step-${stepId}"]`,
  ) as HTMLButtonElement;
}

function stepPanel(container: HTMLElement, stepId: string) {
  return container.querySelector(
    `[data-testid="guided-panel-${stepId}"]`,
  ) as HTMLElement;
}

describe("DecisionOperatingSystem states", () => {
  it("renders an action-first success shell with deeper detail collapsed", () => {
    const html = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);

    expect(html).toContain('data-state-kind="success"');
    expect(html).toContain('data-testid="decision-step-screen"');
    expect(html).toContain('data-testid="primary-answer"');
    expect(html).toContain("Build wealth steadily.");
    expect(html).toContain("Choose Market");
    expect(html).toContain("Review Current Conditions");
    expect(html).toContain("Explore Opportunities");
    expect(html).toContain("Understand Reasoning");
    expect(html).toContain("Decide What To Do");
    expect(html).toContain("Confidence Range");
    expect(html).toContain("58%-84%");
    expect(html).toContain("What We Don&#x27;t Know");
    expect(html).toContain("Market participation");
    expect(html).toContain("Liquidity conditions");
    expect(html).toContain("Wait for stronger confirmation.");
    expect(html).toContain("Daily Progress");
    expect(html).toContain("Patience");
    expect(html).toContain("You Remain In Control");
    expect(html).toContain("Signal guides. You decide.");
    expect(html).toContain("Reliability");
    expect(html).toContain("Risk");
    expect(html).toContain("Why");
    expect(html).toContain("Evidence");
    expect(html).toContain("Investor Judgment");
    expect(html).toContain("Current Thesis");
    expect(html).toContain("Contradicting Evidence");
    expect(html).toContain("Calibration");
    expect(html).toContain("Process Quality");
    expect(html).toContain("Belief Freshness");
    expect(html).toContain("Mind Change Triggers");
    expect(html).toContain("Portfolio Context");
    expect(html).toContain("No previous decisions have been reviewed yet.");
    expect(html).toContain("Decision path");
    expect(html).toContain("Metrics");
    expect(html).toContain("Action plan");
    expect(html).toContain("The range is mixed, so keep the action measured.");
    expect(html).toContain("Lead opportunity");
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
      "opportunity search and decision control confidence check are still being checked.",
    );
    expect(html).toContain(
      "opportunity search and return to normal size need decision control confirmation.",
    );
    expect(html).not.toContain("Governance Calibration");
    expect(html).not.toContain("Discovery and Recovery need Agency confirmation.");
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
    expect(html).toContain("What would you like to explore today?");
    expect(html).toContain("Crypto");
    expect(html).toContain("Stocks");
    expect(html).toContain("Forex");
    expect(html).toContain("Commodities");
    expect(html).toContain("Indexes");
    expect(html).toContain("Bonds");
    expect(html).toContain("Digital assets and tokens");
    expect(html).toContain("Fixed income opportunities");
    expect(html).toContain('data-testid="decision-step-screen"');
    expect(html).toContain('aria-label="Workflow steps"');
  });

  it("declares one bounded scroll strategy for the shell, details, lists, and action row", () => {
    const html = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);

    expect(html).toContain('data-overflow-policy="contained-app-shell"');
    expect(html).toContain('data-testid="decision-main-scroll"');
    expect(html).toContain('data-testid="workflow-detail-panel"');
    expect(html).toContain('data-overflow-policy="card-body-scroll"');
    expect(html).toContain('data-overflow-policy="opportunity-list-scroll"');
    expect(html).toContain('data-overflow-policy="bounded-opportunity-panel"');
    expect(html).toContain('data-layout="market-decision-guide"');
    expect(html).toContain("h-dvh");
    expect(html).toContain("overflow-x-hidden");
    expect(html.match(/data-overflow-policy="card-body-scroll"/g)?.length).toBe(
      6,
    );
  });

  it("covers the market decision guide requirements across data modes", () => {
    const legacy = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          opportunities: [],
          selectedOpportunityId: null,
          evidenceLadder: [],
          rawMetrics: [
            { label: "Confidence", value: "42%" },
            { label: "Trust", value: "Pending" },
            { label: "Market Health", value: "Pending" },
            { label: "Risk Pressure", value: "Pending" },
            { label: "Readiness", value: "35%" },
          ],
          recommendedAction: "Hold",
          suggestedExposure: "No exposure",
        })}
      />,
    );
    expect(legacy).toContain("No opportunity deserves capital yet.");
    expect(legacy).toContain("32%-54%");
    expect(legacy).toContain("Wait for stronger confirmation.");

    const enhanced = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);
    expect(enhanced).toContain("AAPL is the clearest opportunity to review.");
    expect(enhanced).toContain("Trend quality supports continued review.");

    const degraded = renderToStaticMarkup(
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
    expect(degraded).toContain("Review ideas, but keep size small.");
    expect(degraded).toContain("What We Don&#x27;t Know");
  });

  it("renders values passed through the live API adapter contract", () => {
    const markets = parseDashboardMarketOptions({
      data: [{ code: "LSE", label: "London Stocks", count: 2134 }],
    });
    const stocks = parseDashboardStockListResponse(
      {
        data: [
          {
            symbol: "VOD.L",
            name: "Vodafone Group",
            exchange: "LSE",
            price: 71.2,
          },
        ],
      },
      { market: "LSE", offset: 0, limit: 50 },
    );
    const quotes = parseDashboardQuoteBatchResponse(
      {
        quotes: [
          {
            symbol: "VOD.L",
            price: 71.2,
            changePercent: 2.4,
          },
        ],
      },
      { market: "LSE", requestedSymbols: ["VOD.L"] },
    );
    const stock = stocks.items[0];
    const quote = quotes.quotes[0];

    const html = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          marketOptions: markets.map((market) => ({
            value: market.code,
            label: market.label,
          })),
          selectedMarket: markets[0]?.code ?? "",
          marketState: "London trend confirmation",
          marketStatus: "Venue open",
          lastSyncedLabel: "2026-05-31 17:45 ET",
          bestOpportunityLabel: stock?.symbol ?? "",
          opportunities: [
            {
              ...props().opportunities[0],
              id: stock?.symbol ?? "VOD.L",
              ticker: stock?.symbol ?? "VOD.L",
              name: stock?.name ?? "Vodafone Group",
              readinessPct: 88,
              thesis: `${stock?.name ?? "Vodafone Group"} is ranked from live LSE data.`,
              drivers: [
                `Price ${quote?.price}`,
                `Change ${quote?.changePercent}%`,
              ],
            },
          ],
          selectedOpportunityId: stock?.symbol ?? "VOD.L",
          rawMetrics: [
            { label: "Live Price", value: String(quote?.price) },
            { label: "Live Change", value: `${quote?.changePercent}%` },
          ],
        })}
      />,
    );

    expect(html).toContain("LSE");
    expect(html).toContain("Vodafone Group");
    expect(html).toContain("London trend confirmation");
    expect(html).toContain("2026-05-31 17:45 ET");
    expect(html).toContain("Live Price");
    expect(html).toContain("71.2");
    expect(html).not.toContain("Apple");
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

    expect(html).toContain('data-scroll-region="market-entry"');
    expect(html).toContain('data-testid="market-choice-grid"');
    expect(html).toContain("What would you like help with today?");
  });

  it("renders connection, empty, error, partial, stale, refresh, and loading states", () => {
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
    expect(empty).toContain('data-testid="decision-step-screen"');
    expect(empty).toContain("No opportunity deserves capital yet.");
    expect(empty).toContain("Explore Opportunities");

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
              "Opportunity analysis is available, but reliability evidence is incomplete. Wait for a fresh reliability update before increasing allocation.",
          },
        })}
      />,
    );
    expect(partial).toContain("Review ideas, but keep size small.");
    expect(partial).toContain('data-testid="decision-step-screen"');

    const stale = renderToStaticMarkup(
      <DecisionOperatingSystem
        {...props({
          state: {
            ...successState,
            kind: "stale-data",
            headline: "Review, but treat data as stale.",
            description:
              "Last successful update: 12 seconds ago. Refresh before increasing allocation.",
          },
        })}
      />,
    );
    expect(stale).toContain("Review, but treat data as stale.");
    expect(stale).toContain("Refresh before increasing allocation.");
    expect(stale).toContain('data-testid="decision-step-screen"');

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

  it("uses the sidebar as the only workflow navigation surface", () => {
    const html = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);

    expect(html).toContain('aria-label="Workflow steps"');
    expect(html).toContain('data-testid="workflow-progress-summary"');
    expect(html).not.toContain('aria-label="Decision journey"');
  });

  it("clicking workflow steps updates active state, content, and progress", () => {
    const { container, cleanup } = renderInteractive(
      <DecisionOperatingSystem {...props()} />,
    );

    try {
      expect(stepButton(container, "choose-market").dataset.active).toBe("true");
      expect(stepPanel(container, "choose-market").hidden).toBe(false);
      expect(stepPanel(container, "review-current-conditions").hidden).toBe(
        true,
      );
      expect(
        container.querySelector('[data-testid="workflow-progress-summary"]')
          ?.textContent,
      ).toContain("1 complete");

      act(() => {
        stepButton(container, "review-current-conditions").click();
      });

      expect(stepButton(container, "choose-market").dataset.active).toBe("false");
      expect(stepButton(container, "review-current-conditions").dataset.active).toBe(
        "true",
      );
      expect(stepButton(container, "review-current-conditions").dataset.status).toBe(
        "inProgress",
      );
      expect(stepPanel(container, "choose-market").hidden).toBe(true);
      expect(stepPanel(container, "review-current-conditions").hidden).toBe(
        false,
      );
    } finally {
      cleanup();
    }
  });

  it("supports keyboard activation and visible focus styling for sidebar steps", () => {
    const { container, cleanup } = renderInteractive(
      <DecisionOperatingSystem {...props()} />,
    );

    try {
      const opportunities = stepButton(container, "explore-opportunities");
      opportunities.focus();

      expect(document.activeElement).toBe(opportunities);
      expect(opportunities.className).toContain("focus-visible:outline");

      act(() => {
        opportunities.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      expect(opportunities.dataset.active).toBe("true");
      expect(stepPanel(container, "explore-opportunities").hidden).toBe(false);

      const decision = stepButton(container, "decide-what-to-do");
      act(() => {
        decision.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        );
      });

      expect(decision.dataset.active).toBe("true");
      expect(decision.getAttribute("aria-current")).toBe("step");
      expect(decision.getAttribute("aria-controls")).toBe(
        "guided-panel-decide-what-to-do",
      );
    } finally {
      cleanup();
    }
  });

  it("renders status indicators and updates market completion state", () => {
    const selected = renderToStaticMarkup(<DecisionOperatingSystem {...props()} />);
    expect(selected).toContain(
      'data-testid="workflow-step-status-choose-market"',
    );
    expect(selected).toContain('data-status="completed"');
    expect(selected).toContain("Completed");

    const unselected = renderToStaticMarkup(
      <DecisionOperatingSystem {...props({ selectedMarket: "" })} />,
    );
    expect(unselected).toContain('data-status="inProgress"');
    expect(unselected).toContain("0 complete");
  });

  it("keeps inactive workflow content hidden from the visible step area", () => {
    const { container, cleanup } = renderInteractive(
      <DecisionOperatingSystem {...props()} />,
    );

    try {
      const inactivePanels = Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-testid^="guided-panel-"][data-active="false"]',
        ),
      );

      expect(inactivePanels.length).toBe(4);
      expect(inactivePanels.every((panel) => panel.hidden)).toBe(true);

      act(() => {
        stepButton(container, "understand-reasoning").click();
      });

      expect(stepPanel(container, "understand-reasoning").hidden).toBe(false);
      expect(stepPanel(container, "choose-market").hidden).toBe(true);
    } finally {
      cleanup();
    }
  });
});
