import { expect, test } from "@playwright/test";

test("a new visitor can explore, save, return and forget without a brokerage", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {
    name: "What would you like your money to make possible?",
  })).toBeVisible();
  await expect(page.getByText("Practice", { exact: true })).toBeVisible();
  await expect(page.getByText("No brokerage credentials. No automatic trading.")).toBeVisible();

  await page.getByRole("button", { name: "Explore a possibility" }).click();
  await expect(page.getByRole("heading", { name: "Make room for possibility. Keep room to breathe." })).toBeVisible();
  const slider = page.locator("#lumina-app-exposure");
  await slider.fill("40");
  await expect(page.getByText("40%", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("lumina-practice.png"), fullPage: true });
  await page.getByRole("button", { name: "Save this Practice choice" }).click();
  await expect(page.getByRole("region", { name: "Notifications (F8)" }).getByText("nothing was purchased.", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Notifications (F8)" }).getByText("Saved in this browser tab only.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("A Practice idea you saved")).toBeVisible();
  await expect(page.getByText("No market outcomes have been tracked for this choice.")).toBeVisible();

  await page.getByRole("button", { name: "Saved Practice choices" }).click();
  await expect(page.getByText("No confirmed trade or outcome.")).toBeVisible();
  await page.getByRole("button", { name: "Revisit idea", exact: true }).click();
  await expect(slider).toHaveValue("40");
  await page.getByRole("button", { name: "Saved Practice choices" }).click();
  await page.getByRole("button", { name: "Forget choice" }).click();
  await expect(page.getByText("Nothing saved here yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.reload();
  // Absence during the lazy route's loading screen does not prove deletion.
  // Bind both the final assertion and screenshots to the restored application.
  await expect(page.getByTestId("lumina-app")).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "What would you like your money to make possible?",
  })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your message", exact: true })).toBeVisible();
  await expect(page.getByText("A Practice idea you saved")).toHaveCount(0);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.view + 2);
  await page.screenshot({ path: testInfo.outputPath("lumina-welcome.png"), fullPage: true });
});

test("account goals persist, isolate owners, support API updates and user-controlled deletion", async ({ page, request }, testInfo) => {
  const id = `${Date.now()}-${testInfo.project.name}-${testInfo.retry}`;
  const password = "Strong-browser-test-731";
  await page.goto("/lumina");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Browser User");
  await page.getByLabel("Email", { exact: true }).fill(`browser-${id}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Your goals", exact: true }).click();
  await page.getByLabel("What do you want to make possible?").fill("A safe reserve");
  await page.getByLabel("Target (BRL, optional)").fill("1500");
  await page.getByLabel("When (optional)").fill("2027-12-01");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByText("A safe reserve", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Notifications (F8)" }).getByText("does not mean the goal has been achieved.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Your goals", exact: true }).click();
  await expect(page.getByText("A safe reserve", { exact: true })).toBeVisible();

  // Playwright's standalone request fixture has its own cookie jar.
  // It must not share the authenticated page's session.
  const signup = await request.post("/api/auth/sign-up/email", {
    data: { name: "Other Browser", email: `other-${id}@example.com`, password },
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  expect(signup.ok()).toBe(true);
  const ownResponse = await page.request.get("/api/lumina/goals");
  expect(ownResponse.ok()).toBe(true);
  const own = await ownResponse.json();
  expect(own.goals).toHaveLength(1);
  const goal = own.goals[0];
  expect(goal).toMatchObject({ title: "A safe reserve", targetAmount: 1500, targetDate: "2027-12-01" });
  expect((await (await request.get("/api/lumina/goals")).json()).goals).toHaveLength(0);
  expect((await request.put(`/api/lumina/goals/${goal.id}`, { data: { title: "Not mine" } })).status()).toBe(404);
  expect((await request.delete(`/api/lumina/goals/${goal.id}`)).status()).toBe(404);
  const ownUpdate = await page.request.put(`/api/lumina/goals/${goal.id}`, { data: {
    title: "A reserve for later", targetAmount: 1500, targetDate: "2027-12-01",
  } });
  expect(ownUpdate.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Your goals", exact: true }).click();
  await expect(page.getByText("A reserve for later", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove goal", exact: true }).click();
  await expect(page.getByText("A reserve for later", { exact: true })).toHaveCount(0);
  expect((await (await page.request.get("/api/lumina/goals")).json()).goals).toHaveLength(0);

  await page.getByLabel("What do you want to make possible?").fill("A second intention");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByText("A second intention", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Delete my saved L\u00famina data", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await (await page.request.get("/api/lumina/goals")).json()).goals).toHaveLength(1);
  await page.getByRole("button", { name: "Delete my saved L\u00famina data", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications (F8)" }).getByText("Your saved L\u00famina application data was deleted. Your sign-in account remains.", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/lumina/goals")).json()).goals).toHaveLength(0);
  expect((await page.request.get("/api/lumina/me")).ok()).toBe(true);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect((await page.request.get("/api/lumina/goals")).status()).toBe(401);
});

test("market exploration preserves separation between TradingView and exchange evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Market context" }).click();
  await expect(page.getByRole("heading", { name: "Look closer at the market." })).toBeVisible();
  await expect(page.getByText("tradingview-data quote · BTCUSDT")).toBeVisible();
  await page.getByRole("button", { name: "Shares" }).click();
  await expect(page.getByRole("button", { name: "Petrobras" })).toBeVisible();
  await expect(page.getByText("tradingview-data quote · PETR4")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open interactive TradingView chart" })).toBeVisible();
  await expect(page.getByText("Prices and history come through your", { exact: false })).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.view + 2);
});
