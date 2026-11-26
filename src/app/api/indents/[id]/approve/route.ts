import { NextResponse } from "next/server";
import { parseOptionalBody, route } from "@/lib/api";
import { approveIndent } from "@/lib/indents";
import { indentApproveSchema } from "@/lib/schemas/workflow";

// The store approves fully, or partly by giving smaller quantities. SPEC section 7: STOREKEEPER (of the supplying store).
export const POST = route(["STOREKEEPER"], async ({ req, user, params, ip }) => {
  const body = await parseOptionalBody(req, indentApproveSchema); // no body = approve everything as requested
  return NextResponse.json(await approveIndent({ user, id: params.id ?? "", ...body, ip }));
});
