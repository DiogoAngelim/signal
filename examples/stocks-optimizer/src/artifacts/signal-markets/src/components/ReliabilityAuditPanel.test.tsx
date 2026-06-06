import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReliabilityAuditPanel from "./ReliabilityAuditPanel";
import type { MarketReliabilityResult } from "@/lib/market-reliability";

function reliability(overrides: Partial<MarketReliabilityResult> = {}): MarketReliabilityResult {
  return {
    score: 37,
    status: "degraded",
    confidenceCap: 35,
    components: {
      freshness: 40,
      completeness: 55,
      sampleSize: 30,
      sourceQuality: 70,
      consistency: 60,
      outlierSafety: 100,
    },
    diagnostics: [],
    metadata: {
      evaluatedAt: "2026-05-28T14:30:00.000Z",
      inputCount: 72,
      validCount: 18,
      rejectedCount: 54,
    },
    market: {
      venueStatus: "closed",
      synchronizationStatus: "not_synced",
      validAssets: 18,
      rejectedAssets: 54,
      staleRecords: 4,
      missingFields: 3,
      staleCandles: 4,
      missingVolume: 8,
      missingOhlcv: 2,
      duplicateCandles: 1,
      lowSynchronizedSamples: 5,
      partialApiFailures: 2,
      fallbackMode: true,
      syntheticDataDetected: false,
      lastSuccessfulSync: "2026-05-28T14:00:00.000Z",
      defensiveMode: true,
      primaryIssues: ["Venue closed", "Low ticker coverage", "Missing synchronized samples"],
      explanation: "Market data is incomplete or stale.",
    },
    ...overrides,
  };
}

describe("ReliabilityAuditPanel", () => {
  it("renders degraded reliability diagnostics", () => {
    const html = renderToStaticMarkup(<ReliabilityAuditPanel reliability={reliability()} />);

    expect(html).toContain("Data reliability audit");
    expect(html).toContain("37 / 100");
    expect(html).toContain("Degraded");
    expect(html).toContain("Confidence cap");
    expect(html).toContain("35%");
    expect(html).toContain("Valid assets");
    expect(html).toContain("18");
    expect(html).toContain("Not Synced");
    expect(html).toContain("Fallback mode");
    expect(html).toContain("Active");
    expect(html).toContain("Low ticker coverage");
  });

  it("renders healthy and invalid status tones without crashing", () => {
    const healthy = renderToStaticMarkup(
      <ReliabilityAuditPanel
        reliability={reliability({
          score: 92,
          status: "healthy",
          confidenceCap: 100,
          market: {
            ...reliability().market,
            venueStatus: "open",
            synchronizationStatus: "synced",
            fallbackMode: false,
            defensiveMode: false,
            lastSuccessfulSync: null,
            primaryIssues: ["No dominant reliability issues"],
            explanation: "Market data is synchronized and usable.",
          },
        })}
      />,
    );
    const invalid = renderToStaticMarkup(
      <ReliabilityAuditPanel reliability={reliability({ status: "invalid", score: 0, confidenceCap: 20 })} />,
    );
    const empty = renderToStaticMarkup(<ReliabilityAuditPanel reliability={null} />);
    const partial = renderToStaticMarkup(
      <ReliabilityAuditPanel
        reliability={reliability({
          market: {
            ...reliability().market,
            synchronizationStatus: "partial",
            lastSuccessfulSync: null,
          },
        })}
      />,
    );
    const waiting = renderToStaticMarkup(
      <ReliabilityAuditPanel
        reliability={reliability({
          market: {
            ...reliability().market,
            synchronizationStatus: "not_synced",
            lastSuccessfulSync: null,
          },
        })}
      />,
    );
    const invalidDate = renderToStaticMarkup(
      <ReliabilityAuditPanel
        reliability={reliability({
          market: {
            ...reliability().market,
            lastSuccessfulSync: "not-a-date",
          },
        })}
      />,
    );

    expect(healthy).toContain("Healthy");
    expect(healthy).toContain("Inactive");
    expect(healthy).toContain("Session load");
    expect(invalid).toContain("Invalid");
    expect(empty).toBe("");
    expect(partial).toContain("Partial session");
    expect(waiting).toContain("Waiting");
    expect(invalidDate).toContain("not-a-date");
  });
});
