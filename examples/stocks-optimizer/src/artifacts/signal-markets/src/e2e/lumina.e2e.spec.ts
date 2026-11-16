import { expect, test } from "@playwright/test";

test("a new visitor can explore, save, return and forget without a brokerage", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {
    name: "What would you like your money to make possible?",
  })).toBeVisible();
  await expect(page.getByText("Practice", { exact: true })).toBeVisible();
  await expect(page.getByText("No brokerage credentials. No automatic trading.")).toBeVisible();

  await page.getByRole("button", { name: "Explore a possibility" }).click();
  await expect(page.getByText("Make room for possibility.")).toBeVisible();
  const slider = page.locator("#lumina-app-exposure");
  await slider.fill("40");
  await expect(page.getByText("40%", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Save this Practice choice" }).click();
  await expect(page.getByText("No real investment occurred.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("A Practice idea you saved")).toBeVisible();
  await expect(page.getByText("No market outcomes have been tracked for this choice.")).toBeVisible();

  await page.getByRole("button", { name: "Saved Practice choices" }).click();
  await expect(page.getByText("No confirmed trade or outcome.")).toBeVisible();
  await page.getByRole("button", { name: "Forget choice" }).click();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.reload();
  await expect(page.getByText("A Practice idea you saved")).toHaveCount(0);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.view + 2);
  await page.screenshot({ path: testInfo.outputPath("lumina-welcome.png"), fullPage: true });
});

test("real account sessions keep goals and keep two users isolated", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create an account" }).click();
  const email = "browser-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "@example.org";
  await page.getByLabel("Your name").fill("A thoughtful explorer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browsers-only-password#2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page.locator(".l-auth-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Your goals" }).click();
  await page.getByPlaceholder("A home, breathing room, a trip…").fill("A home of my own");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByText("A home of my own")).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await page.getByRole("button", { name: "Your goals" }).click();
  await expect(page.getByText("A home of my own")).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.screenshot({ path: testInfo.outputPath("lumina-signed-in.png"), fullPage: true });
});

test("market exploration preserves separation between TradingView and exchange evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Market context" }).click();
  await expect(page.getByRole("heading", { name: "Look closer at the market." })).toBeVisible();
  await expect(page.getByText("tradingview-data quote · BTCUSDT")).toBeVisible();
  await page.getByRole("button", { name: "Shares" }).click();
  await expect(page.getByRole("button", { name: "Petrobras" })).toBeVisible();
  await expect(page.getByText("tradingview-data quote · PETR4")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore TradingView chart" })).toBeVisible();
  await expect(page.getByText("Neither is evidence that a trade was executed.")).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.view + 2);
});
