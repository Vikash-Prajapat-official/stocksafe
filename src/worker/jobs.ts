// The nightly jobs. Kept separate from the scheduler (index.ts) so they can be run and tested directly.

import nodemailer from "nodemailer";
import { getLowStock } from "@/lib/alerts";
import { writeAudit } from "@/lib/audit";
import { getDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { buildDigest } from "@/lib/digest";
import { todayIST } from "@/lib/fefo";
import { anonymisePatientLabels, parseRetentionDays } from "@/lib/retention";

export type MailMessage = { from: string; to: string[]; subject: string; text: string; html: string };
export type MailTransport = { sendMail(message: MailMessage): Promise<unknown> };

/** A mail transport for an SMTP address such as smtp://user:pass@mail.example.org:587 (or smtps://... for TLS). */
export function createMailTransport(smtpUrl: string): MailTransport {
  const t = nodemailer.createTransport(smtpUrl);
  return { sendMail: (m) => t.sendMail(m) };
}

export type DigestConfig = { to: string[]; from: string; appUrl: string };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DigestConfig {
  return {
    to: (env.DIGEST_TO ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+$/.test(s)),
    from: env.SMTP_FROM?.trim() || "StockSafe <stocksafe@localhost>",
    appUrl: (env.APP_URL ?? "").trim(),
  };
}

export type DigestStatus = { status: "sent" } | { status: "skipped" } | { status: "failed"; error: string };

/**
 * The nightly alert job: works out the expiry and low-stock picture, records the run in the audit log and, if email
 * is set up (SMTP_URL and DIGEST_TO), sends the digest. A mail failure is logged and audited but never throws.
 */
export async function runAlertJob(
  opts: { transport?: MailTransport | null; config?: DigestConfig; now?: Date } = {},
): Promise<{ date: string; expiredCount: number; lowStockCount: number; digest: DigestStatus }> {
  const date = todayIST(opts.now);
  const config = opts.config ?? configFromEnv();
  const smtp = process.env.SMTP_URL?.trim();
  const transport = opts.transport === undefined ? (smtp ? createMailTransport(smtp) : null) : opts.transport;

  const [dash, low, hospital] = await Promise.all([getDashboard({ today: date }), getLowStock({ today: date }), db.hospital.findFirst({ select: { name: true } })]);
  await writeAudit(db, { action: "ALERT_JOB_RUN", entity: "job", entityId: date });

  let digest: DigestStatus = { status: "skipped" };
  if (transport && config.to.length > 0) {
    const mail = buildDigest({
      hospitalName: hospital?.name ?? "StockSafe",
      date,
      appUrl: config.appUrl,
      expired: dash.expired,
      bands: dash.bands.map((b) => ({ label: b.label, count: b.count, valuePaise: b.valuePaise })),
      lowStock: {
        total: low.length,
        out: low.filter((r) => r.status === "OUT").length,
        top: low.slice(0, 15).map((r) => ({ name: r.name, strength: r.strength, unit: r.unit, onHand: r.onHand, suggested: r.suggested, status: r.status })),
      },
      pendingIndents: dash.pendingIndents,
      openCounts: dash.openCounts,
    });
    try {
      await transport.sendMail({ from: config.from, to: config.to, subject: mail.subject, text: mail.text, html: mail.html });
      digest = { status: "sent" };
      await writeAudit(db, { action: "DIGEST_SENT", entity: "job", entityId: `${date}: ${config.to.length} recipient(s)` });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      digest = { status: "failed", error };
      await writeAudit(db, { action: "DIGEST_FAILED", entity: "job", entityId: `${date}: ${error}`.slice(0, 200) });
    }
  }
  return { date, expiredCount: dash.expired.count, lowStockCount: low.length, digest };
}

/** The retention job: clears patient names and tokens older than RETENTION_DAYS (the ledger is never edited). */
export async function runRetentionJob(opts: { days?: number; now?: Date } = {}): Promise<{ date: string; days: number; anonymised: number }> {
  const days = opts.days ?? parseRetentionDays(process.env.RETENTION_DAYS);
  const anonymised = await anonymisePatientLabels({ days, now: opts.now });
  const date = todayIST(opts.now);
  await writeAudit(db, { action: "RETENTION_RUN", entity: "job", entityId: `${date}: ${anonymised} patient label(s) anonymised (older than ${days} days)` });
  return { date, days, anonymised };
}
