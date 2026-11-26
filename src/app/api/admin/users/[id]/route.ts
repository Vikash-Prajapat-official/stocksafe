import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { hashPassword } from "@/lib/password";
import { ADMIN_ONLY } from "@/lib/rbac";
import { userPatchSchema } from "@/lib/schemas/admin";

export const PATCH = route(ADMIN_ONLY, async ({ req, user, params, ip }) => {
  const id = params.id ?? "";
  const body = await parseBody(req, userPatchSchema);

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
  if (!target) throw new ApiError(404, "NOT_FOUND", "User not found.");

  // Never let the system end up with no active admin, and never let an admin lock themselves out.
  const losesAdmin =
    target.role === "ADMIN" &&
    target.active &&
    ((body.role !== undefined && body.role !== "ADMIN") || body.active === false);
  if (losesAdmin) {
    if (id === user.id)
      throw new ApiError(400, "CANNOT_MODIFY_SELF", "You cannot deactivate yourself or remove your own admin role.");
    const otherAdmins = await db.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
    if (otherAdmins === 0)
      throw new ApiError(400, "LAST_ADMIN", "There must be at least one active admin.");
  }
  if (id === user.id && body.active === false)
    throw new ApiError(400, "CANNOT_MODIFY_SELF", "You cannot deactivate yourself.");

  let phone: string | undefined;
  if (body.phone !== undefined) {
    const p = normalizePhone(body.phone);
    if (!p) throw new ApiError(400, "VALIDATION", "phone: Enter a valid 10-digit Indian mobile number");
    phone = p;
  }
  const storeIds = body.storeIds ? [...new Set(body.storeIds)] : undefined;
  if (storeIds?.length && (await db.store.count({ where: { id: { in: storeIds } } })) !== storeIds.length)
    throw new ApiError(400, "VALIDATION", "storeIds: one or more stores do not exist");
  const passwordHash = body.password ? await hashPassword(body.password) : undefined;

  const updated = await db.$transaction(async (tx) => {
    if (storeIds) {
      await tx.userStore.deleteMany({ where: { userId: id } });
      await tx.userStore.createMany({ data: storeIds.map((storeId) => ({ userId: id, storeId })) });
    }
    const u = await tx.user.update({
      where: { id },
      data: { name: body.name, phone, role: body.role, active: body.active, passwordHash },
      select: { id: true, name: true, phone: true, role: true, active: true, stores: { select: { storeId: true } } },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      action: passwordHash ? "USER_UPDATE_PASSWORD" : "USER_UPDATE",
      entity: "user",
      entityId: id,
      ip,
    });
    return u;
  });
  const { stores, ...rest } = updated;
  return NextResponse.json({ user: { ...rest, storeIds: stores.map((s) => s.storeId) } });
});
