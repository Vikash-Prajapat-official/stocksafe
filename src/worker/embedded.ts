import cron from "node-cron";
import { runAlertJob, runRetentionJob } from "./jobs";

// Single-PC mode has no separate worker container, so the web server runs the same nightly jobs itself (India time):
//   02:00 retention, 02:30 encrypted backup, 06:30 alerts and the email digest.
// Started once from src/instrumentation.ts.
const TZ = "Asia/Kolkata";
const log = (m: string) => console.log(`[scheduler ${new Date().toISOString()}] ${m}`);

async function safely(name: string, fn: () => Promise<string>) {
  try {
    log(`${name}: ${await fn()}`);
  } catch (e) {
    log(`${name} FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

type BackupModule = { backupSqlite: () => Promise<{ file: string; bytes: number }> };

async function backup() {
  if (!process.env.BACKUP_PASSPHRASE?.trim()) return "skipped (BACKUP_PASSPHRASE is not set)";
  // a plain Node module kept outside the bundle: it uses node:sqlite and is also the command-line backup tool
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const mod = (await import(/* webpackIgnore: true */ pathToFileURL(path.resolve("scripts/sqlite-backup.mjs")).href)) as BackupModule;
  const r = await mod.backupSqlite();
  return `wrote ${r.file}`;
}

export function startEmbeddedScheduler() {
  const g = globalThis as { __stocksafeScheduler?: boolean };
  if (g.__stocksafeScheduler) return; // hot reload in development would otherwise double the jobs
  g.__stocksafeScheduler = true;
  const add = (name: string, expr: string, fn: () => Promise<string>) => {
    if (!cron.validate(expr)) return log(`invalid schedule "${expr}" for ${name}`);
    let running = false;
    cron.schedule(
      expr,
      async () => {
        if (running) return;
        running = true;
        try {
          await safely(name, fn);
        } finally {
          running = false;
        }
      },
      { timezone: TZ },
    );
  };
  add("retention", process.env.RETENTION_CRON?.trim() || "0 2 * * *", async () => `${(await runRetentionJob()).anonymised} label(s) anonymised`);
  add("backup", process.env.BACKUP_CRON?.trim() || "30 2 * * *", backup);
  add("alerts", process.env.ALERT_CRON?.trim() || "30 6 * * *", async () => {
    const r = await runAlertJob();
    return `${r.expiredCount} expired, ${r.lowStockCount} low, digest ${r.digest.status}`;
  });
  log("nightly jobs scheduled (retention 02:00, backup 02:30, alerts 06:30 India time)");
}
