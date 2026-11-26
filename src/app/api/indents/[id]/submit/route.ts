import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { submitIndent } from "@/lib/indents";

// Send a draft indent to the store. SPEC section 7: NURSE (of that ward).
export const POST = route(["NURSE"], async ({ user, params, ip }) => {
  return NextResponse.json(await submitIndent({ user, id: params.id ?? "", ip }));
});
