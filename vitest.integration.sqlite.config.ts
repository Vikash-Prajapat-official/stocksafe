import { defineConfig } from "vitest/config";
import path from "node:path";

// The same integration suites, run against SQLite (single-PC mode). Needs the SQLite test client first:
//   node scripts/generate-test-client.mjs
const FILE = path.resolve(__dirname, "prisma", "stocksafe_test.db");

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: path.resolve(__dirname, "node_modules/.prisma/client-sqlite/index.js") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup-sqlite.ts"],
    env: { DATABASE_URL: `file:${FILE.split(path.sep).join("/")}` },
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
