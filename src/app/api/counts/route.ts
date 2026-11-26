import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { listCounts, startCount } from "@/lib/counts";
import { countStartSchema } from "@/lib/schemas/workflow";

export const GET = route(["STOREKEEPER", "ADMIN", "AUDITOR"], async ({ user }) => {
  return NextResponse.json({ counts: await listCounts(user) });
});

// Start a count for a store (snapshots what the system thinks is there). SPEC section 7: STOREKEEPER, ADMIN.
export const POST = route(["STOREKEEPER", "ADMIN"], async ({ req, user, ip }) => {
  const body = await parseBody(req, countStartSchema);
  return NextResponse.json({ count: await startCount({ user, storeId: body.storeId, ip }) }, { status: 201 });
});
