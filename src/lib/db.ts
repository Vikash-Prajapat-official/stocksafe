import { PrismaClient } from "@prisma/client";
import { isSqlite } from "@/lib/dialect";

// SQLite (single-PC mode) allows one writer at a time. One connection makes every write queue up in order instead of
// failing with "database is locked"; WAL mode (set when the file is created) lets that one connection read at the same time.
function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !isSqlite || /[?&]connection_limit=/.test(url)) return undefined;
  return url + (url.includes("?") ? "&" : "?") + "connection_limit=1&socket_timeout=30";
}

// One PrismaClient per process (avoids exhausting connections during Next dev hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = databaseUrl();
export const db = globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
