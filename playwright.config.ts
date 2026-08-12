import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://127.0.0.1:3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: `${localBaseUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          AI_MODE: "mock",
          HOSTNAME: "127.0.0.1",
          PERSISTENCE_DRIVER: "memory",
          PORT: "3100",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
