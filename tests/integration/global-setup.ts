import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://stocksafe:change-me@localhost:5434/stocksafe_test";

/** Drops and recreates the test database, then applies all migrations to it. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  // Safety: this script DROPs a database. Never allow it to point at a real one.
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": the test database name must end with _test`);
  }

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
