import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run against a real PostgreSQL database named *_test that is dropped and
// recreated on every run (see tests/integration/global-setup.ts). Start Postgres first:
//   docker compose up -d db
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://stocksafe:change-me@localhost:5434/stocksafe_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
