import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createFixtureMaritimeAdapters } from "../src/adapters.js";
import { createMaritimeSignalApp } from "../src/signal.js";
import { MaritimeMap } from "../src/frontend/MaritimeMap.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime map rendering", () => {
  it("renders a lightweight SVG map with vessels, clusters, and controls", async () => {
    const app = createMaritimeSignalApp({
      adapters: createFixtureMaritimeAdapters("busy-port"),
      now
    });
    const briefing = await app.getGuide("santos-port-br");
    const html = renderToStaticMarkup(<MaritimeMap briefing={briefing} onCreateArea={() => undefined} />);

    expect(html).toContain("Context map for Port of Santos");
    expect(html).toContain("Zoom in");
    expect(html).toContain("Zoom out");
    expect(html).toContain("Reset map");
    expect(html).toContain("vessel-marker");
    expect(html).toContain("vessel-cluster");
    expect(html).toContain("active");
  });
});
