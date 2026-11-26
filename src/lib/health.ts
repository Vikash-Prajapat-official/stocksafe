import { db } from "@/lib/db";

export type HealthStatus = {
  ok: boolean;
  app: "ok";
  database: "ok" | "down";
  time: string;
};

/** Pings the database with SELECT 1. Never throws. */
export async function checkHealth(): Promise<HealthStatus> {
  let database: HealthStatus["database"] = "down";
  try {
    await db.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "down";
  }
  return { ok: database === "ok", app: "ok", database, time: new Date().toISOString() };
}
