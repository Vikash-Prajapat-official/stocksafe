import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";
import { renderReportPdf } from "@/lib/pdf/report-pdf";
import { reportToCsv } from "@/lib/report-format";
import { buildReport, isReportName } from "@/lib/reports";

export const dynamic = "force-dynamic";

function intParam(sp: URLSearchParams, name: string): number | undefined {
  const v = sp.get(name);
  if (v === null || v === "") return undefined;
  if (!/^\d{1,4}$/.test(v)) throw new ApiError(400, "VALIDATION", `${name}: must be a whole number`);
  return Number(v);
}

// stock | expiry | consumption | abc | stockout. ?store=<id> &months=<n> &days=<n> &format=json|csv|pdf
// SPEC section 7: ADMIN, AUDITOR (read-only).
export const GET = route(["ADMIN", "AUDITOR"], async ({ req, user, params, ip }) => {
  const name = params.name ?? "";
  if (!isReportName(name)) throw new ApiError(404, "NOT_FOUND", "Unknown report. Use stock, expiry, consumption, abc or stockout.");
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "json";
  if (!["json", "csv", "pdf"].includes(format)) throw new ApiError(400, "VALIDATION", "format: use json, csv or pdf");
  const storeId = sp.get("store") || undefined;
  if (storeId && !(await db.store.findUnique({ where: { id: storeId }, select: { id: true } }))) throw new ApiError(404, "NOT_FOUND", "Store not found.");

  let report;
  try {
    report = await buildReport(name, { storeId, months: intParam(sp, "months"), days: intParam(sp, "days") });
  } catch (e) {
    if (e instanceof RangeError) throw new ApiError(400, "VALIDATION", e.message);
    throw e;
  }
  if (format === "json") return NextResponse.json({ report });

  const file = `stocksafe-${name}-${todayIST()}.${format}`;
  await writeAudit(db, { actorUserId: user.id, action: "REPORT_EXPORT", entity: "report", entityId: `${name}.${format}`, ip });
  if (format === "csv") {
    return new Response(reportToCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
    });
  }
  const hospital = await db.hospital.findFirst({ select: { name: true } });
  const pdf = await renderReportPdf(report, { hospitalName: hospital?.name ?? "StockSafe" });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"` },
  });
});
