// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import LuminaApp from "./lumina-app";
import LuminaMarketPanel from "./lumina-market";
import { luminaApi } from "@/lib/lumina-api";

const notices = vi.hoisted(() => ({ toast: vi.fn(() => ({ dismiss: vi.fn() })) }));
vi.mock("@/hooks/use-toast", () => ({ toast: notices.toast }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

// Private snapshots must belong to the account generation that requested them.
describe("L\u00famina account request lifecycle", () => {
  const mounted: Array<() => void> = [];
  afterEach(() => {
    mounted.splice(0).forEach(cleanup => cleanup());
    vi.restoreAllMocks();
    notices.toast.mockClear();
    sessionStorage.clear();
  });

  function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  async function setup() {
    const goals = pending<Awaited<ReturnType<typeof luminaApi.goals>>>();
    const at = "2026-11-17T12:00:00.000Z";
    vi.spyOn(luminaApi, "capabilities").mockResolvedValue({
      app: "lumina", auth: true, registrationReady: true, persistentData: true,
      ai: false, aiModel: null, connectedBroker: false, realExecution: false,
      backgroundMonitoring: false, practiceMode: true,
    });
    vi.spyOn(luminaApi, "me").mockResolvedValue({ user: {
      id: "owner-a", email: "alice@example.test", name: "Alice",
    } });
    vi.spyOn(luminaApi, "goals").mockReturnValue(goals.promise);
    vi.spyOn(luminaApi, "practice").mockResolvedValue({ choices: [{
      id: "private-practice", at, amount: 5000, exposedPercent: 20,
      accessiblePercent: 80, goal: "Private goal", goalId: null, horizon: "later",
      rationale: "", provenance: "illustrative", executed: false,
    }] });
    vi.spyOn(luminaApi, "conversations").mockResolvedValue({ conversations: [{
      id: "private-thought", title: "Private thought", createdAt: at, updatedAt: at,
    }] });
    vi.spyOn(luminaApi, "inbox").mockResolvedValue({ events: [{
      id: "private-event", kind: "watch", title: "Private event", body: "Private detail",
      source: "test", evidenceAt: at, seenAt: null, resolvedAt: null, createdAt: at,
    }], monitoring: "checked-on-visit", pushNotifications: false });
    vi.spyOn(luminaApi, "watches").mockResolvedValue({ watches: [{
      id: "private-watch", symbol: "BTCUSDT", direction: "above", threshold: 50000,
      active: true, triggeredAt: null, createdAt: at,
    }] });
    vi.spyOn(luminaApi, "signOut").mockResolvedValue({ ok: true });
    vi.spyOn(luminaApi, "erasePersonalData").mockResolvedValue({ ok: true, scope: "lumina_app_data_only" });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    mounted.push(() => { act(() => root.unmount()); host.remove(); });
    await act(async () => { root.render(<LuminaApp />); });
    expect(luminaApi.goals).toHaveBeenCalledOnce();
    async function click(label: string) {
      const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find(item => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === label);
      expect(button, `Expected button: ${label}`).toBeDefined();
      await act(async () => { button!.click(); });
    }
    return { host, goals, click, at };
  }

  for (const boundary of ["sign-out", "erase"] as const) {
    it(`does not restore a delayed private snapshot after ${boundary}`, async () => {
      const { host, goals, click, at } = await setup();
      await click("Account");
      if (boundary === "sign-out") await click("Sign out");
      else {
        await click("Delete my saved L\u00famina data");
        await click("Confirm deletion");
      }
      // Resolve the actual pending Promise and flush React before asserting absence.
      await act(async () => {
        goals.resolve({ goals: [{ id: "private-goal", title: "Private goal",
          targetAmount: 5000, targetDate: "2027-12-01", description: "",
          createdAt: at, updatedAt: at }] });
        await goals.promise;
      });
      await click("Your goals");
      expect(host.textContent).not.toContain("Private goal");
      if (boundary === "sign-out") expect(host.textContent).toContain("Sign in to keep your goals");
      await click("Close panel");
      await click("Past thoughts");
      expect(host.textContent).toContain("No saved conversations yet.");
      expect(host.textContent).not.toContain("Private thought");
      await click("Close panel");
      await click("Inbox");
      expect(host.textContent).toContain("No events require your attention.");
      expect(host.textContent).not.toContain("Private event");
      expect(host.textContent).not.toContain("Watching on visit");
      await click("Close panel");
      await click("Saved Practice choices");
      expect(host.textContent).toContain("Nothing saved here yet.");
    });
  }

  it("does not announce a failed account refresh after sign-out", async () => {
    const { goals, click } = await setup();
    await click("Account"); await click("Sign out");
    notices.toast.mockClear();
    await act(async () => {
      goals.reject(new Error("Late account failure"));
      await goals.promise.catch(() => undefined);
    });
    expect(notices.toast).not.toHaveBeenCalled();
  });

  it("does not continue a delayed watch refresh after sign-out", async () => {
    const { host, goals, click } = await setup();
    await act(async () => { goals.resolve({ goals: [] }); await goals.promise; });
    const slowInbox = pending<Awaited<ReturnType<typeof luminaApi.inbox>>>();
    vi.mocked(luminaApi.inbox).mockReturnValueOnce(slowInbox.promise);
    await click("Inbox (1 unread)"); await click("Check saved watch levels");
    await click("Close panel"); await click("Account"); await click("Sign out");
    vi.mocked(luminaApi.watches).mockClear(); notices.toast.mockClear();
    await act(async () => {
      slowInbox.resolve({ events: [], monitoring: "checked-on-visit", pushNotifications: false });
      await slowInbox.promise;
    });
    expect(luminaApi.watches).not.toHaveBeenCalled();
    expect(notices.toast).not.toHaveBeenCalled();
    await click("Inbox");
    expect(host.textContent).toContain("No events require your attention.");
  });
});
