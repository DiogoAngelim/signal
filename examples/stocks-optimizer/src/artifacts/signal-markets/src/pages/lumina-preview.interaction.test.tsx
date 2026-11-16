// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import LuminaPreview from "./lumina-preview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderJourney() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root?.render(<LuminaPreview />); });
  return host;
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(host?.querySelectorAll("button") ?? []).find((node) => node.textContent?.includes(text));
  if (!found) throw new Error("Missing button: " + text);
  return found;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("Lúmina interactive first visit", () => {
  it("goes from curiosity to a reversible visual and in-tab practice history", () => {
    const page = renderJourney();
    expect(page.textContent).toContain("What would you like your money to make possible?");

    act(() => { button("I have some money to invest").click(); });
    expect(page.textContent).toContain("When do you think you might need this money?");

    act(() => { button("Within a year").click(); });
    expect(page.textContent).toContain("Let's see what flexibility could look like.");
    expect(page.querySelector<HTMLInputElement>("#lumina-exposure")?.value).toBe("20");
    expect(page.textContent).toContain("20%");

    act(() => { button("Save this practice choice").click(); });
    expect(page.textContent).toContain("Saved as a practice choice.");
    expect(page.textContent).toContain("No asset was purchased");

    const history = page.querySelector<HTMLButtonElement>('[aria-label="Open practice history"]');
    if (!history) throw new Error("Missing history button");
    act(() => { history.click(); });
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain("Practice only");
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain("No real purchase");

    act(() => { button("Clear practice history").click(); });
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain("Nothing saved yet");
  });

  it("opens an invented example without asking for credentials", () => {
    const page = renderJourney();
    act(() => { button("I'm just curious").click(); });
    expect(page.textContent).toContain("made-up R$ 5,000");
    expect(page.textContent).toContain("Market-exposed portion");
    expect(page.textContent).not.toContain("Enter your brokerage password");
    const slider = page.querySelector<HTMLInputElement>("#lumina-exposure");
    expect(slider?.min).toBe("0");
    expect(slider?.max).toBe("100");
    expect(slider?.step).toBe("5");
  });
});
