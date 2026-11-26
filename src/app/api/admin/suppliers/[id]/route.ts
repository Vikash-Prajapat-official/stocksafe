import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ADMIN_ONLY } from "@/lib/rbac";
import { blankToNull, supplierPatchSchema } from "@/lib/schemas/admin";

export const PATCH = route(ADMIN_ONLY, async ({ req, user, params, ip }) => {
  const id = params.id ?? "";
  const body = await parseBody(req, supplierPatchSchema);
  const supplier = await db.$transaction(async (tx) => {
    const updated = await tx.supplier.update({
      where: { id },
      data: {
        name: body.name,
        phone: body.phone === undefined ? undefined : blankToNull(body.phone),
        gstin: body.gstin === undefined ? undefined : (blankToNull(body.gstin)?.toUpperCase() ?? null),
        address: body.address === undefined ? undefined : blankToNull(body.address),
      },
    });
    await writeAudit(tx, { actorUserId: user.id, action: "SUPPLIER_UPDATE", entity: "supplier", entityId: id, ip });
    return updated;
  });
  return NextResponse.json({ supplier });
});
