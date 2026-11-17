import { test, expect } from "@playwright/test";

test.describe("emotional support without pressure or unintended actions", () => {
  test("explicit commands only; support is optional and correctable", async ({ page }) => {
    await page.goto("/lumina");
    await page.getByRole("button", { name: "Explore a possibility", exact: true }).click();
    const exposure = page.locator("#lumina-app-exposure");
    const before = await exposure.inputValue();
    const message = page.getByRole("textbox", { name: "Your message", exact: true });
    await message.fill("I lost 30%");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(exposure).toHaveValue(before);
    await expect(page.getByText("A loss or a decision you regret can be difficult to revisit.", { exact: false }).first()).toBeVisible();
    await page.getByText("Why this response?", { exact: true }).click();
    await page.getByRole("button", { name: "That interpretation is not right: use Direct responses", exact: true }).click();
    await expect(message).toBeFocused();
    await page.getByText("Response preferences", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Direct", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Adapt support to what I explicitly say in this message", exact: true })).not.toBeChecked();
    await message.fill("30% market");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(exposure).toHaveValue("30");
    await page.getByRole("button", { name: "New thought", exact: true }).last().click();
    await expect(message).toHaveValue("");
    await expect(page.getByRole("complementary", { name: "About this response" })).toHaveCount(0);
    await expect(page.getByText("A loss or a decision you regret can be difficult to revisit.", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Balanced", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Adapt support to what I explicitly say in this message", exact: true })).toBeChecked();
  });
  test("pause needs no account, provider, financial action or forced next question", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/lumina");
    await page.getByRole("textbox", { name: "Your message", exact: true }).fill("Stop");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("We can leave this here. Nothing needs to be decided now.", { exact: true })).toBeVisible();
    await expect(page.getByText("Guided reply on this page", { exact: false }).first()).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});

test("mixed celebration and pressure never changes an allocation or invites urgency", async ({ page }) => {
  await page.goto("/lumina");
  await page.getByRole("button", { name: "Explore a possibility", exact: true }).click();
  const exposure = page.locator("#lumina-app-exposure");
  const before = await exposure.inputValue();
  const message = page.getByRole("textbox", { name: "Your message", exact: true });
  await message.fill("I reached my goal but I must buy now");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("A sense of urgency does not make the evidence stronger.", { exact: false })).toBeVisible();
  await expect(page.getByText("That sounds meaningful to you.", { exact: false })).toHaveCount(0);
  await expect(exposure).toHaveValue(before);
  await message.fill("I lost 30%");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(exposure).toHaveValue(before);
  await message.fill("30% market");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(exposure).toHaveValue("30");
});
