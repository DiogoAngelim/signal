import { test, expect } from "@playwright/test";

for (const path of ["/", "/lumina"]) {
  test(`Lúmina starts without a runtime error at ${path}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const failedModules: string[] = [];
    // Browser syntax errors may have an empty stack; preserve the actual message.
    page.on("pageerror", error => errors.push(error.stack || `${error.name}: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", response => {
      if (response.status() >= 400 && /\.(?:[cm]?[jt]sx?|css)(?:\?|$)/.test(response.url())) {
        failedModules.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(path);
    try {
      await expect(page.getByTestId("lumina-app")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Your message", exact: true })).toBeVisible();
      expect(errors.filter(error => !error.includes("Failed to load resource"))).toEqual([]);
      expect(failedModules).toEqual([]);
    } finally {
      const evidence = {
        path,
        url: page.url(),
        runtimeErrors: errors,
        failedModules,
        visibleText: (await page.locator("body").innerText()).slice(0, 6000),
      };
      await testInfo.attach("startup-evidence.json", {
        body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json",
      });
      if (errors.length || failedModules.length) console.error(JSON.stringify(evidence, null, 2));
    }
  });
}
