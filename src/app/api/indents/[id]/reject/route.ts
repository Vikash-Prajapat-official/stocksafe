import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { rejectIndent } from "@/lib/indents";
import { indentRejectSchema } from "@/lib/schemas/workflow";

export const POST = route(["STOREKEEPER"], async ({ req, user, params, ip }) => {
  const body = await parseBody(req, indentRejectSchema);
  return NextResponse.json(await rejectIndent({ user, id: params.id ?? "", note: body.note, ip }));
});
