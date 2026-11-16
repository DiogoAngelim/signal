import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LuminaApp from "./lumina-app";
import LuminaMarketPanel from "./lumina-market";

describe("Lúmina integrated experience", () => {
  it("starts with a peaceful conversation, no forced sign-in or fake holdings", () => {
    const html = renderToStaticMarkup(<LuminaApp />);
    expect(html).toContain('data-testid="lumina-app"');
    expect(html).toContain("What would you like your money to make possible?");
    expect(html).toContain("Practice");
    expect(html).toContain("Your goals");
    expect(html).toContain("Market context");
    expect(html).not.toContain("Trade executed");
    expect(html).not.toContain("Account required");
    expect(html).not.toContain("Buy Bitcoin");
    expect(html).toContain("No brokerage credentials");
  });
  it("does not claim market price or connected holdings before verification", () => {
    const html = renderToStaticMarkup(<LuminaMarketPanel user={null} />);
    expect(html).toContain("Checking");
    expect(html).toContain("tradingview-data quote");
    expect(html).toContain("Digital assets");
    expect(html).toContain("Shares");
    expect(html).toContain("TradingView chart");
    expect(html).not.toContain('data-trade-executed="true"');
    expect(html).not.toContain("Verified holding");
  });
});
