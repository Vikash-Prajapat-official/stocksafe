import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAlertJob, runRetentionJob } from "@/worker/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The nightly jobs for hosts with no worker container (Vercel Cron calls this once a day, see vercel.json):
// clear old patient names, then work out expiry and low stock (and send the email digest if email is set up).
// Public on purpose, but only for a caller holding CRON_SECRET: Vercel sends it as "Authorization: Bearer <secret>".
// With no CRON_SECRET set the route is closed to everyone.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const ok = secret.length >= 16 && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Please sign in." } }, { status: 401 });

  const retention = await runRetentionJob();
  const alerts = await runAlertJob();
  return NextResponse.json({
    retention: { anonymised: retention.anonymised, days: retention.days },
    alerts: { expired: alerts.expiredCount, low: alerts.lowStockCount, digest: alerts.digest.status },
  });
}
