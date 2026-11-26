import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { itemExists } from "@/lib/items";
import { ADMIN_ONLY } from "@/lib/rbac";
import { itemPatchSchema, levelProblem } from "@/lib/schemas/item";
import { blankToNull } from "@/lib/schemas/admin";

export const GET = route("ANY", async ({ params }) => {
  const item = await db.item.findUnique({ where: { id: params.id ?? "" } });
  if (!item) throw new ApiError(404, "NOT_FOUND", "Item not found.");
  return NextResponse.json({ item });
});

export const PATCH = route(ADMIN_ONLY, async ({ req, user, params, ip }) => {
  const id = params.id ?? "";
  const patch = await parseBody(req, itemPatchSchema);
  const existing = await db.item.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Item not found.");

  const problem = levelProblem({
    minLevel: patch.minLevel ?? existing.minLevel,
    reorderLevel: patch.reorderLevel ?? existing.reorderLevel,
    maxLevel: patch.maxLevel ?? existing.maxLevel,
  });
  if (problem) throw new ApiError(400, "VALIDATION", `${problem.field}: ${problem.message}`);

  const strength = patch.strength === undefined ? existing.strength : blankToNull(patch.strength);
  const identityChanged =
    (patch.name !== undefined && patch.name !== existing.name) ||
    strength !== existing.strength ||
    (patch.form !== undefined && patch.form !== existing.form);
  if (identityChanged && (await itemExists(patch.name ?? existing.name, strength, patch.form ?? existing.form, id)))
    throw new ApiError(409, "DUPLICATE", "An item with the same name, strength and form already exists.");

  const item = await db.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id },
      data: {
        name: patch.name,
        genericName: patch.genericName === undefined ? undefined : blankToNull(patch.genericName),
        strength: patch.strength === undefined ? undefined : strength,
        form: patch.form,
        unit: patch.unit,
        category: patch.category === undefined ? undefined : blankToNull(patch.category),
        isEssential: patch.isEssential,
        storage: patch.storage,
        minLevel: patch.minLevel,
        reorderLevel: patch.reorderLevel,
        maxLevel: patch.maxLevel,
        active: patch.active,
      },
    });
    await writeAudit(tx, { actorUserId: user.id, action: "ITEM_UPDATE", entity: "item", entityId: id, ip });
    return updated;
  });
  return NextResponse.json({ item });
});
