import { NextResponse } from "next/server";
import { parseOptionalBody, route } from "@/lib/api";
import { closeIndent } from "@/lib/indents";
import { indentCloseSchema } from "@/lib/schemas/workflow";

// End a partly issued indent: nothing more will be sent for what is still outstanding.
export const POST = route(["STOREKEEPER"], async ({ req, user, params, ip }) => {
  const body = await parseOptionalBody(req, indentCloseSchema);
  return NextResponse.json(await closeIndent({ user, id: params.id ?? "", note: body.note, ip }));
});
