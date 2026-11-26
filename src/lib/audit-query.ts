import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditFilter = {
  actorId?: string;
  action?: string;
  entity?: string;
  /** YYYY-MM-DD, India date, inclusive. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** A real calendar date written YYYY-MM-DD (rejects 2026-13-45 and 2026-02-30). */
export function isValidDay(d: string | undefined | null): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istEnd = (d: string) => new Date(new Date(`${d}T00:00:00+05:30`).getTime() + 86_400_000 - 1);

export function auditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  for (const d of [f.from, f.to]) if (d && !isValidDay(d)) throw new RangeError("dates must be real dates like 2026-11-27");
  return {
    ...(f.actorId ? { actorUserId: f.actorId } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.from || f.to ? { at: { ...(f.from ? { gte: istStart(f.from) } : {}), ...(f.to ? { lte: istEnd(f.to) } : {}) } } : {}),
  };
}

/** The audit log, newest first. Read-only: the table itself rejects edits and deletes. */
export async function listAudit(f: AuditFilter = {}) {
  const pageSize = Math.min(Math.max(1, Math.trunc(f.pageSize ?? 50)), 200);
  const page = Math.max(1, Math.trunc(f.page ?? 1));
  const where = auditWhere(f);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({ id: r.id, at: r.at, action: r.action, entity: r.entity, entityId: r.entityId, ip: r.ip, actorName: r.actor?.name ?? null })),
    total,
    page,
    pageSize,
  };
}

/** Every distinct action name, for the filter drop-down. */
export async function listAuditActions(): Promise<string[]> {
  const r = await db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  return r.map((x) => x.action);
}
