import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createFixtureMaritimeAdapters } from "../src/adapters.js";
import type { MaritimeArea, MaritimeBriefing } from "../src/contracts.js";
import { createMaritimeSignalApp } from "../src/signal.js";
import {
  GuideView,
  HomeScreen,
  RiskCard
} from "../src/frontend/App.js";

const noop = () => undefined;
const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime frontend rendering", () => {
  it("renders a simple area-choice first screen", () => {
    const empty = renderToStaticMarkup(
      <HomeScreen
        query=""
        results={[]}
        status="idle"
        onQueryChange={noop}
        onSearch={noop}
        onChooseArea={noop}
        onUseSuggestion={noop}
      />
    );
    const loading = renderToStaticMarkup(
      <HomeScreen
        query="Santos"
        results={[]}
        status="searching"
        onQueryChange={noop}
        onSearch={noop}
        onChooseArea={noop}
        onUseSuggestion={noop}
      />
    );

    expect(empty).toContain("Choose a maritime area");
    expect(empty).toContain("Start with any maritime place.");
    expect(empty).toContain("Port of Santos");
    expect(loading).toContain("Looking now.");
  });

  it("renders the guide flow without dashboard or surveillance language", async () => {
    const briefing = await guideFor("santos-port-br", "busy-port");
    const html = renderGuide(briefing);

    expect(html).toContain("Current Situation");
    expect(html).toContain("What Matters");
    expect(html).toContain("What Is Threatened");
    expect(html).toContain("Why We Think That");
    expect(html).toContain("Live Context Map");
    expect(html).toContain("What You Can Do");
    expect(html).toContain("What Remains Unclear");
    expect(html).toContain("What To Watch Next");
    expect(html.toLowerCase()).not.toContain("dashboard");
    expect(html.toLowerCase()).not.toContain("surveillance");
    expect(html.toLowerCase()).not.toContain("military");
  });

  it("keeps raw technical details behind disclosure on risk cards", async () => {
    const briefing = await guideFor("south-atlantic", "rough-sea");
    const collapsed = renderToStaticMarkup(<RiskCard risk={briefing.risks[0]!} />);

    expect(collapsed).toContain("Sea conditions may be harder");
    expect(collapsed).not.toContain("waveHeightM");
    expect(collapsed).not.toContain("Wave height is around");
    expect(collapsed).not.toContain("AIS");
  });
});

async function guideFor(areaId: string, fixtureId: Parameters<typeof createFixtureMaritimeAdapters>[0]): Promise<MaritimeBriefing> {
  const app = createMaritimeSignalApp({
    adapters: createFixtureMaritimeAdapters(fixtureId),
    now
  });
  return app.getGuide(areaId);
}

function renderGuide(briefing: MaritimeBriefing): string {
  return renderToStaticMarkup(
    <GuideView
      briefing={briefing}
      query={briefing.area.name}
      results={[] as MaritimeArea[]}
      status="ready"
      onQueryChange={noop}
      onSearch={noop}
      onChooseArea={noop}
      onRefresh={noop}
      onChooseMapArea={noop}
    />
  );
}
