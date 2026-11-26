import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { dispense, previewPicks } from "@/lib/stock";
import { dispenseSchema } from "@/lib/schemas/stock";
import { assertStoreAccess } from "@/lib/store-access";

// Dispense to a patient (FEFO). SPEC section 7: PHARMACIST. "preview": true only shows the split.
export const POST = route(["PHARMACIST"], async ({ req, user, ip }) => {
  const body = await parseBody(req, dispenseSchema);
  await assertStoreAccess(user, body.storeId);
  if (body.preview) {
    return NextResponse.json({ preview: true, lines: await previewPicks({ storeId: body.storeId, lines: body.lines }) });
  }
  const result = await dispense({ storeId: body.storeId, lines: body.lines, patientLabel: body.patientLabel, actorUserId: user.id, ip });
  return NextResponse.json(result, { status: 201 });
});
