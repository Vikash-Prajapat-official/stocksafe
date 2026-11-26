import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Drops and rebuilds the e2e database with the demo accounts and the item list (no demo history: tests make their own stock). */
export default async function setup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://stocksafe:change-me@localhost:5434/stocksafe_e2e";
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  // Safety: this DROPs a database. Only ever one whose name ends in _e2e.
  if (!/^[a-z0-9_]+_e2e$/.test(name)) throw new Error(`Refusing to reset "${name}": the e2e database name must end with _e2e`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  try {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await prisma.$disconnect();
  }
  const env = { ...process.env, DATABASE_URL: url, SEED_DEMO: "0", SEED_PASSWORD: "ChangeMe@123" };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
