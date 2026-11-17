// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { buildHumanSupportPlan, DEFAULT_SUPPORT_PREFERENCES, type SupportPreferences } from "@signal/decision/core";
import { LuminaSupportControls, LuminaSupportExplanation } from "./lumina-support";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); });
describe("visible support control", () => {
  it("provides direct mode, opt-out and honest retention without a diagnosis", async () => {
    let latest: SupportPreferences = { ...DEFAULT_SUPPORT_PREFERENCES };
    function Harness() {
      const [value, setValue] = useState(latest);
      return <LuminaSupportControls value={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); cleanup.push(() => { act(() => root.unmount()); host.remove(); });
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toContain("No emotional profile");
    const direct = host.querySelector<HTMLInputElement>('input[value="direct"]')!;
    await act(async () => direct.click()); expect(latest.mode).toBe("direct");
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => toggle.click()); expect(latest.adaptToExplicitCues).toBe(false);
    const select = host.querySelector("select")!;
    await act(async () => { select.value = "pt-BR"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(latest.locale).toBe("pt-BR"); expect(host.textContent).toContain("Idioma do apoio");
  });
  it("explains a tentative interpretation and lets the user correct it", async () => {
    let corrected = false;
    const plan = buildHumanSupportPlan({ message: "I am worried" });
    const host = document.createElement("div"); const root = createRoot(host);
    cleanup.push(() => { act(() => root.unmount()); host.remove(); });
    await act(async () => root.render(<LuminaSupportExplanation plan={plan} onCorrect={() => { corrected = true; }} />));
    expect(host.textContent).toContain("not a diagnosis");
    await act(async () => host.querySelector("button")!.click()); expect(corrected).toBe(true);
  });
  it("keeps acknowledgement optional and support readable without motion or icons", () => {
    const plan = buildHumanSupportPlan({ message: "Estou confuso", preferences: { locale: "pt-BR" } });
    const html = renderToStaticMarkup(<LuminaSupportExplanation plan={plan} onCorrect={() => {}} showAcknowledgement />);
    expect(html).toContain("Por que esta resposta?");
    expect(html).toContain(plan.acknowledgement);
    expect(html).not.toContain("<svg");
  });
});
