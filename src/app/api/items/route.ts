import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { itemExists, listItems } from "@/lib/items";
import { ADMIN_ONLY } from "@/lib/rbac";
import { itemCreateSchema, levelProblem, normalizeGtin, toItemInput } from "@/lib/schemas/item";

const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

// Anyone signed in may read the item master.
export const GET = route("ANY", async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const active = sp.get("active");
  const result = await listItems({
    q: sp.get("q") ?? undefined,
    page: int(sp.get("page")),
    pageSize: int(sp.get("pageSize")),
    active: active === "true" ? true : active === "false" ? false : undefined,
    gtin: normalizeGtin(sp.get("gtin")) ?? undefined,
  });
  return NextResponse.json(result);
});

export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const data = toItemInput(await parseBody(req, itemCreateSchema));
  const problem = levelProblem(data);
  if (problem) throw new ApiError(400, "VALIDATION", `${problem.field}: ${problem.message}`);
  if (await itemExists(data.name, data.strength, data.form))
    throw new ApiError(409, "DUPLICATE", "An item with the same name, strength and form already exists.");

  const item = await db.$transaction(async (tx) => {
    const created = await tx.item.create({ data });
    await writeAudit(tx, { actorUserId: user.id, action: "ITEM_CREATE", entity: "item", entityId: created.id, ip });
    return created;
  });
  return NextResponse.json({ item }, { status: 201 });
});
