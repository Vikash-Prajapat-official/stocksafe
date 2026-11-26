import { PrismaClient } from "@prisma/client";

// One PrismaClient per process (avoids exhausting connections during Next dev hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
