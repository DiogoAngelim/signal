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

function unmountJourney() {
  if (root) act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
}
afterEach(() => {
  unmountJourney();
  window.sessionStorage.clear();
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


describe("Lúmina returning to a saved Practice idea", () => {
  it("survives a tab reload without inventing market outcomes or synced memory", () => {
    const initial = renderJourney();
    act(() => { button("I'm just curious").click(); });
    act(() => { button("Save this practice choice").click(); });
    expect(initial.textContent).toContain("Saved as a practice choice.");
    expect(window.sessionStorage.getItem("lumina-preview-practice-v1")).toContain('"executed":false');

    // Remount models refreshing this same tab. Conversation text is not kept.
    unmountJourney();
    const returned = renderJourney();
    expect(returned.textContent).toContain("Good to have you back.");
    expect(returned.textContent).toContain("Practice · Not a holding");
    expect(returned.textContent).toContain("We haven't monitored prices");
    expect(returned.textContent).not.toContain("Just explore a simple example");

    act(() => { button("What changed?").click(); });
    expect(returned.textContent).toContain("can't verify what changed");
    expect(returned.textContent).toContain("doesn't monitor prices");

    act(() => { button("Continue exploring").click(); });
    expect(returned.textContent).toContain("not a verified position");
    expect(returned.querySelector<HTMLInputElement>("#lumina-exposure")?.value).toBe("20");
    expect(returned.textContent).toContain("Save this practice choice");
  });

  it("forgets the specific idea and never restores it on a subsequent visit", () => {
    renderJourney();
    act(() => { button("I'm just curious").click(); });
    act(() => { button("Save this practice choice").click(); });
    unmountJourney();

    const returned = renderJourney();
    act(() => { button("Forget this choice").click(); });
    expect(returned.textContent).toContain("forgotten from this browser tab");
    expect(returned.textContent).toContain("What would you like your money to make possible?");
    expect(window.sessionStorage.getItem("lumina-preview-practice-v1")).toBeNull();

    unmountJourney();
    const clean = renderJourney();
    expect(clean.textContent).not.toContain("Good to have you back.");
    expect(clean.textContent).toContain("What would you like your money to make possible?");
  });
});
