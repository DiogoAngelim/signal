import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LuminaPreview from "./lumina-preview";

describe("Lúmina isolated preview", () => {
  it("starts with a peaceful, optional first visit", () => {
    const html = renderToStaticMarkup(<LuminaPreview />);
    expect(html).toContain('data-testid="lumina-first-journey"');
    expect(html).toContain("What would you like your money to make possible?");
    expect(html).toContain("Practice · Demo");
    expect(html).toContain("No account. No credentials. No real trades.");
    expect(html).toContain('data-provenance="illustrative"');
  });

  it("never renders a fake verified position, execution button, or confidence score", () => {
    const html = renderToStaticMarkup(<LuminaPreview />);
    expect(html).not.toContain("Trade executed");
    expect(html).not.toContain("Connect brokerage");
    expect(html).not.toContain("confidence score");
    expect(html).not.toContain("API key");
    expect(html).not.toContain("Live signal");
  });
});
