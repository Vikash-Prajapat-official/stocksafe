import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { issue, previewPicks, transfer } from "@/lib/stock";
import { issueSchema } from "@/lib/schemas/stock";
import { assertStoreAccess } from "@/lib/store-access";

// Issue out of a store, or transfer to another store. FEFO. SPEC section 7: STOREKEEPER, PHARMACIST.
// With "preview": true it only returns the FEFO split and writes nothing.
export const POST = route(["STOREKEEPER", "PHARMACIST"], async ({ req, user, ip }) => {
  const body = await parseBody(req, issueSchema);
  await assertStoreAccess(user, body.fromStoreId);

  if (body.preview) {
    const lines = await previewPicks({ storeId: body.fromStoreId, lines: body.lines });
    return NextResponse.json({ preview: true, lines });
  }
  const result =
    body.mode === "TRANSFER"
      ? await transfer({ fromStoreId: body.fromStoreId, toStoreId: body.toStoreId!, lines: body.lines, reason: body.reason, actorUserId: user.id, ip })
      : await issue({ storeId: body.fromStoreId, lines: body.lines, reason: body.reason ?? "", actorUserId: user.id, ip });
  return NextResponse.json(result, { status: 201 });
});
