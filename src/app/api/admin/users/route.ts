import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { hashPassword } from "@/lib/password";
import { ADMIN_ONLY } from "@/lib/rbac";
import { userCreateSchema } from "@/lib/schemas/admin";

const publicUser = {
  id: true,
  name: true,
  phone: true,
  role: true,
  active: true,
  stores: { select: { storeId: true } },
} as const;

export const GET = route(ADMIN_ONLY, async () => {
  const rows = await db.user.findMany({ orderBy: { name: "asc" }, select: publicUser });
  const users = rows.map(({ stores, ...u }) => ({ ...u, storeIds: stores.map((s) => s.storeId) }));
  return NextResponse.json({ users });
});

export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const body = await parseBody(req, userCreateSchema);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new ApiError(400, "VALIDATION", "phone: Enter a valid 10-digit Indian mobile number");

  const storeIds = [...new Set(body.storeIds ?? [])];
  if (storeIds.length && (await db.store.count({ where: { id: { in: storeIds } } })) !== storeIds.length)
    throw new ApiError(400, "VALIDATION", "storeIds: one or more stores do not exist");

  const passwordHash = await hashPassword(body.password);
  const created = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: body.name,
        phone,
        passwordHash,
        role: body.role,
        active: body.active ?? true,
        stores: { create: storeIds.map((storeId) => ({ storeId })) },
      },
      select: publicUser,
    });
    await writeAudit(tx, { actorUserId: user.id, action: "USER_CREATE", entity: "user", entityId: u.id, ip });
    return u;
  });
  const { stores, ...rest } = created;
  return NextResponse.json({ user: { ...rest, storeIds: stores.map((s) => s.storeId) } }, { status: 201 });
});
