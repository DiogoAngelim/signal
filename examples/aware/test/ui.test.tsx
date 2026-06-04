import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createFixtureAwareAdapters } from "../src/adapters.js";
import type { Briefing } from "../src/contracts.js";
import { createAwareSignalApp } from "../src/signal.js";
import {
  BriefingCard,
  BriefingView,
  HomeScreen
} from "../src/frontend/App.js";

const noop = () => undefined;
const now = () => new Date("2026-06-01T12:40:00.000Z");

describe("Aware frontend rendering", () => {
  it("renders the empty and loading states around one primary question", () => {
    const empty = renderToStaticMarkup(
      <HomeScreen
        query=""
        results={[]}
        status="idle"
        onQueryChange={noop}
        onSearch={noop}
        onChooseRegion={noop}
      />
    );
    const loading = renderToStaticMarkup(
      <HomeScreen
        query="Miami"
        results={[]}
        status="searching"
        onQueryChange={noop}
        onSearch={noop}
        onChooseRegion={noop}
      />
    );

    expect(empty).toContain("Where are you today?");
    expect(empty).toContain("Start with a city or region.");
    expect(empty).toContain("Weather awareness map");
    expect(empty).toContain("Zoom in");
    expect(empty).not.toContain("No clear concern");
    expect(empty).not.toContain("Pay attention");
    expect(loading).toContain("Looking now.");
  });

  it("renders normal, warning, urgency, emergency, and degraded briefing states", async () => {
    const normal = await briefingFor("seattle-wa", "normal-day");
    const warning = await briefingFor("miami-fl", "strong-uv-day");
    const urgency = await briefingFor("phoenix-az", "heat-warning-day");
    const degraded = await briefingFor("miami-fl", "source-unavailable");
    const emergency = withEmergencyItem(urgency);

    expect(renderBriefing(normal)).toContain("Nothing unusual requires attention");
    const warningHtml = renderBriefing(warning);
    expect(warningHtml).toContain("Warning");
    expect(warningHtml).toContain("Sun exposure may be strong");
    expect(warningHtml).toContain("Some weather conditions may affect plans today.");
    expect(warningHtml).toContain("Reduce Exposure");
    expect(warningHtml).not.toContain("Weather signals");
    expect(warningHtml).not.toContain("weather-signal");
    expect(renderBriefing(urgency)).toContain("Urgency");
    expect(renderBriefing(emergency)).toContain("Emergency");
    expect(renderBriefing(degraded)).toContain("Evidence is limited");
  });

  it("does not expose raw technical metrics on a collapsed first-screen card", async () => {
    const briefing = await briefingFor("new-york-ny", "poor-air-quality-day");
    const html = renderToStaticMarkup(<BriefingCard item={briefing.items[0]!} />);

    expect(html).toContain("Air may be harder to breathe");
    expect(html).not.toMatch(/\bAQI\b|usAqi|pm25|UV|precipitationMm|°|178|58/);
  });

  it("does not render unsafe medical certainty language", async () => {
    const briefings = [
      await briefingFor("miami-fl", "multiple-simultaneous-risks"),
      await briefingFor("new-york-ny", "poor-air-quality-day"),
      await briefingFor("san-juan-pr", "mosquito-activity-warning")
    ];
    const html = briefings.map(renderBriefing).join("\n").toLowerCase();

    expect(html).not.toContain("you will get sick");
    expect(html).not.toContain("this is safe");
    expect(html).not.toContain("this is guaranteed");
    expect(html).not.toContain("you should ignore official alerts");
  });
});

async function briefingFor(regionId: string, fixtureId: Parameters<typeof createFixtureAwareAdapters>[0]): Promise<Briefing> {
  const app = createAwareSignalApp({
    adapters: createFixtureAwareAdapters(fixtureId),
    now
  });
  return app.getBriefing(regionId);
}

function renderBriefing(briefing: Briefing): string {
  return renderToStaticMarkup(
    <BriefingView
      briefing={briefing}
      query={briefing.region.name}
      results={[]}
      status="ready"
      onQueryChange={noop}
      onSearch={noop}
      onChooseRegion={noop}
      onRefresh={noop}
    />
  );
}

function withEmergencyItem(briefing: Briefing): Briefing {
  const first = briefing.items[0]!;
  return {
    ...briefing,
    attentionLevel: "emergency",
    attentionLabel: "Emergency",
    summary: "Immediate protective action may be needed. Follow local official guidance.",
    items: [
      {
        ...first,
        attentionLevel: "emergency",
        attentionLabel: "Emergency",
        meaning: "Immediate protective action may be needed.",
        primaryAction: "Shelter"
      },
      ...briefing.items.slice(1)
    ]
  };
}
