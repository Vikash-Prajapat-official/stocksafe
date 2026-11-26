import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { auditWhere, listAudit } from "@/lib/audit-query";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const int = (v: string | null) => (v && /^\d{1,6}$/.test(v) ? Number(v) : undefined);
const MAX_CSV_ROWS = 20_000;

// The audit log: who did what, and when. ?actor=<user id> &action= &entity= &from=YYYY-MM-DD &to=YYYY-MM-DD &page= &format=csv
// Read-only for ADMIN and AUDITOR; the table itself refuses edits and deletes.
export const GET = route(["ADMIN", "AUDITOR"], async ({ req, user, ip }) => {
  const sp = new URL(req.url).searchParams;
  const filter = {
    actorId: sp.get("actor") || undefined,
    action: sp.get("action") || undefined,
    entity: sp.get("entity") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  };
  try {
    auditWhere(filter);
  } catch (e) {
    throw new ApiError(400, "VALIDATION", e instanceof Error ? e.message : "invalid filter");
  }

  if (sp.get("format") === "csv") {
    const { rows, total } = await listAudit({ ...filter, page: 1, pageSize: 200 });
    const all = [...rows];
    for (let p = 2; all.length < Math.min(total, MAX_CSV_ROWS); p++) all.push(...(await listAudit({ ...filter, page: p, pageSize: 200 })).rows);
    await writeAudit(db, { actorUserId: user.id, action: "REPORT_EXPORT", entity: "report", entityId: "audit-log.csv", ip });
    const ist = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Kolkata" });
    const csv = toCsv(
      ["When (India time)", "User", "Action", "Entity", "Entity ID", "IP address"],
      all.slice(0, MAX_CSV_ROWS).map((r) => [ist.format(r.at), r.actorName ?? "(system)", r.action, r.entity, r.entityId, r.ip]),
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="stocksafe-audit-log.csv"' } });
  }
  return NextResponse.json(await listAudit({ ...filter, page: int(sp.get("page")), pageSize: int(sp.get("pageSize")) }));
});
