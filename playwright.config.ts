import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real, built app in a real browser against a throwaway PostgreSQL database
// (stocksafe_e2e, dropped and rebuilt every run by tests/e2e/global-setup.ts). Needs:
//   docker compose up -d db      (PostgreSQL on localhost:5434)
//   npm run build                (the app is tested the way it runs for real)
//   npm run test:e2e
const PORT = 3100;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://stocksafe:change-me@localhost:5434/stocksafe_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // the journey spec is one story told in order, so tests run one at a time
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-only-secret-e2e-only-secret-123456",
      AUTH_TRUST_HOST: "true",
      PORT: String(PORT),
      RETENTION_DAYS: "90",
    },
  },
});
