import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getIndent } from "@/lib/indents";

export const GET = route("ANY", async ({ user, params }) => {
  return NextResponse.json({ indent: await getIndent(user, params.id ?? "") });
});
