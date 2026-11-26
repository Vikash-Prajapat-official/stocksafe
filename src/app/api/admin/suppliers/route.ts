import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ADMIN_ONLY } from "@/lib/rbac";
import { blankToNull, supplierCreateSchema } from "@/lib/schemas/admin";

export const GET = route(ADMIN_ONLY, async () => {
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ suppliers });
});

export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const body = await parseBody(req, supplierCreateSchema);
  const supplier = await db.$transaction(async (tx) => {
    const created = await tx.supplier.create({
      data: {
        name: body.name,
        phone: blankToNull(body.phone),
        gstin: blankToNull(body.gstin)?.toUpperCase() ?? null,
        address: blankToNull(body.address),
      },
    });
    await writeAudit(tx, { actorUserId: user.id, action: "SUPPLIER_CREATE", entity: "supplier", entityId: created.id, ip });
    return created;
  });
  return NextResponse.json({ supplier }, { status: 201 });
});
