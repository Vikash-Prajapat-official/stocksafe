import { NextResponse } from "next/server";
import { ApiError, parseBody, route } from "@/lib/api";
import { getCount, reopenCount, saveCountLines, submitCount } from "@/lib/counts";
import { countPatchSchema } from "@/lib/schemas/workflow";
import { assertStoreAccess } from "@/lib/store-access";

// The count with its lines and the variance report. A store keeper sees counts of his own stores; admin and auditor see all.
export const GET = route(["STOREKEEPER", "ADMIN", "AUDITOR"], async ({ user, params }) => {
  const count = await getCount(params.id ?? "");
  if (user.role === "STOREKEEPER") await assertStoreAccess(user, count.storeId);
  return NextResponse.json({ count });
});

// Save counted quantities ({ lines }), submit for approval ({ action: "submit" }), or (admin) send back ({ action: "reopen" }).
export const PATCH = route(["STOREKEEPER", "ADMIN"], async ({ req, user, params, ip }) => {
  const id = params.id ?? "";
  const body = await parseBody(req, countPatchSchema);
  if (body.lines) await saveCountLines({ user, id, lines: body.lines });
  if (body.action === "submit") return NextResponse.json(await submitCount({ user, id, ip }));
  if (body.action === "reopen") return NextResponse.json(await reopenCount({ user, id, ip }));
  if (!body.lines) throw new ApiError(400, "VALIDATION", "Nothing to do");
  return NextResponse.json({ id, saved: body.lines.length });
});
