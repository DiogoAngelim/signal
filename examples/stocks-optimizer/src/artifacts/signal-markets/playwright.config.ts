import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:5173";
export default defineConfig({
  testDir: "./src/e2e",
  timeout: 40_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "mobile-320", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: "node ../../../scripts/serve-lumina-ci.mjs",
      url: "http://127.0.0.1:4010/api/lumina/capabilities",
      reuseExistingServer: !process.env.CI,
      timeout: 50_000,
    },
    {
      command: "pnpm dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 50_000,
    },
  ],
});
