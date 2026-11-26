import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { itemKey } from "@/lib/schemas/item";

export type ItemListParams = { q?: string; page?: number; pageSize?: number; active?: boolean; gtin?: string };

/** Shared by GET /api/items and the items page so they always agree. */
export async function listItems({ q, page = 1, pageSize = 50, active, gtin }: ItemListParams) {
  const take = Math.min(Math.max(1, Math.trunc(pageSize)), 200);
  const pageNo = Math.max(1, Math.trunc(page));
  const term = q?.trim();
  const where: Prisma.ItemWhereInput = {
    ...(active === undefined ? {} : { active }),
    ...(gtin ? { gtin } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { genericName: { contains: term, mode: "insensitive" } },
            { category: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.item.findMany({
      where,
      orderBy: [{ name: "asc" }, { strength: "asc" }],
      skip: (pageNo - 1) * take,
      take,
    }),
    db.item.count({ where }),
  ]);
  return { items, total, page: pageNo, pageSize: take };
}

/** True if another item has the same name, strength and form (ignoring case and spacing). */
export async function itemExists(
  name: string,
  strength: string | null,
  form: string,
  excludeId?: string,
): Promise<boolean> {
  const key = itemKey(name, strength, form);
  const candidates = await db.item.findMany({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true, strength: true, form: true },
  });
  return candidates.some((c) => c.id !== excludeId && itemKey(c.name, c.strength, c.form) === key);
}

export async function existingItemKeys(): Promise<Set<string>> {
  const rows = await db.item.findMany({ select: { name: true, strength: true, form: true } });
  return new Set(rows.map((r) => itemKey(r.name, r.strength, r.form)));
}
