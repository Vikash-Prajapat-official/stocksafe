import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/** Writes one audit row. Pass the transaction client to make it part of the same transaction. */
export async function writeAudit(
  client: Client,
  e: {
    actorUserId?: string | null;
    action: string;
    entity: string;
    entityId: string;
    ip?: string | null;
  },
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: e.actorUserId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      ip: e.ip ?? null,
    },
  });
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip");
  return ip ? ip.slice(0, 64) : null;
}
