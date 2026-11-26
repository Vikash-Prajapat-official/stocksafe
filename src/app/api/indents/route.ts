import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { createIndent, listIndents } from "@/lib/indents";
import { indentCreateSchema } from "@/lib/schemas/workflow";
import type { IndentStatus } from "@/lib/indent-flow";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIAL", "ISSUED", "REJECTED"];

// A ward sees its own indents, a store sees the ones sent to it, admin and auditor see all.
export const GET = route("ANY", async ({ req, user }) => {
  const status = new URL(req.url).searchParams.get("status");
  if (status && !STATUSES.includes(status)) throw new ApiError(400, "VALIDATION", "status: unknown status");
  const indents = await listIndents({ user, status: (status as IndentStatus | null) ?? undefined });
  return NextResponse.json({ indents });
});

// A ward nurse raises an indent for her own ward. SPEC section 7: NURSE.
export const POST = route(["NURSE"], async ({ req, user, ip }) => {
  const body = await parseBody(req, indentCreateSchema);
  const indent = await createIndent({ user, ...body, ip });
  return NextResponse.json({ indent }, { status: 201 });
});
