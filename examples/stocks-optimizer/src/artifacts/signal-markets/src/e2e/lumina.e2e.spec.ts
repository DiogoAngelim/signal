import { test, expect } from "@playwright/test";

 test("guest can explore, save, resume and distinguish illustration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lumina-app")).toBeVisible();
  await expect(page.getByRole("heading", { name: /let.s think about it/i })).toBeVisible();
  await page.getByRole("button", { name: "Explore a possibility", exact: true }).click();
  await expect(page.getByTestId("lumina-practice-workspace")).toBeVisible();
  await page.getByRole("button", { name: "All set", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shape a possibility" })).toBeVisible();
  const slider = page.getByRole("slider", { name: /hypothetical allocation/i });
  await slider.fill("30");
  await expect(page.getByText("30%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Something else", exact: true }).click();
  await page.getByLabel("Asset name").fill("A small experiment");
  await page.getByLabel("Category").selectOption("digital");
  await page.getByLabel("Note").fill("A fictional idea");
  await page.getByRole("button", { name: "Add possibility", exact: true }).click();
  await page.getByRole("button", { name: "Save this idea", exact: true }).click();
  // Assert the actual event and storage scope, not obsolete celebratory copy.
  await expect(page.getByText("nothing was purchased.", { exact: false })).toBeVisible();
  await expect(page.getByText("Saved in this browser tab only.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Your choices", exact: false }).first().click();
  await expect(page.getByText("A small experiment", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resume illustration", exact: true }).click();
  await expect(slider).toHaveValue("30");
});

test("account data persists and is isolated; goal CRUD, export and deletion work", async ({ page, request }, testInfo) => {
  const id = `${Date.now()}-${testInfo.project.name}`;
  const email = `browser-${id}@example.com`;
  const password = "Strong-browser-test-731";
  await page.goto("/lumina");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Browser User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Browser User", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: false }).first().click();
  await page.getByLabel("What matters to you?").fill("A safe reserve");
  await page.getByLabel("Amount").fill("1500");
  await page.getByLabel("By when?").fill("2027-12-01");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByText("A safe reserve", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Goals", exact: false }).first().click();
  await expect(page.getByText("A safe reserve", { exact: true })).toBeVisible();

  const outsiderSignup = await request.post("/api/auth/sign-up/email", {
    data: { name: "Other Browser", email: `other-${id}@example.com`, password },
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  expect(outsiderSignup.ok()).toBe(true);
  const ownGoals = await page.request.get("/api/lumina/goals");
  const own = await ownGoals.json();
  const outsidersGoals = await request.get("/api/lumina/goals");
  expect((await outsidersGoals.json()).goals).toHaveLength(0);
  expect((await request.patch(`/api/lumina/goals/${own.goals[0].id}`, { data: { title: "Stolen" } })).status()).toBe(404);

  await page.getByRole("button", { name: "Edit goal A safe reserve" }).click();
  await page.getByLabel("What matters to you?").fill("A reserve for later");
  await page.getByRole("button", { name: "Update goal", exact: true }).click();
  await expect(page.getByText("A reserve for later", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: false }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("lumina-data-export.json");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my Lúmina data", exact: true }).click();
  await expect(page.getByText("Your Lúmina records were deleted.", { exact: false })).toBeVisible();
  const after = await page.request.get("/api/lumina/goals");
  expect((await after.json()).goals).toHaveLength(0);
});
