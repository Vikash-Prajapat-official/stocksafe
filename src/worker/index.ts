import cron from "node-cron";
import { db } from "@/lib/db";
import { runAlertJob, runRetentionJob } from "./jobs";

// The worker container. Schedules (India time, override with ALERT_CRON / RETENTION_CRON):
//   02:00  retention  - clears patient names older than RETENTION_DAYS
//   06:30  alerts     - works out expiry and low stock, records the run, emails the digest if email is set up
// Run a job once by hand:   npm run job:alerts   |   npm run job:retention
const TZ = "Asia/Kolkata";

function log(msg: string) {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

const JOBS = {
  alerts: async () => {
    const r = await runAlertJob();
    log(`alerts: ${r.expiredCount} expired batch(es), ${r.lowStockCount} item(s) below reorder level, digest ${r.digest.status}${r.digest.status === "failed" ? ` (${r.digest.error})` : ""}`);
  },
  retention: async () => {
    const r = await runRetentionJob();
    log(`retention: ${r.anonymised} patient label(s) older than ${r.days} days anonymised`);
  },
} as const;
type JobName = keyof typeof JOBS;

async function runSafely(name: JobName) {
  try {
    await JOBS[name]();
  } catch (e) {
    log(`${name} FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  }
}

const [mode, which] = process.argv.slice(2);

/** One-off run: `tsx src/worker/index.ts once alerts` (also `retention`, or `all`). */
async function runOnce() {
  const names = which === "all" || !which ? (Object.keys(JOBS) as JobName[]) : [which as JobName];
  for (const n of names) {
    if (!(n in JOBS)) {
      console.error(`Unknown job "${n}". Use: alerts, retention, all`);
      process.exit(2);
    }
  }
  for (const n of names) await runSafely(n);
  await db.$disconnect();
  process.exit(0);
}

function schedule(name: JobName, expr: string) {
  if (!cron.validate(expr)) {
    log(`invalid schedule "${expr}" for ${name}`);
    process.exit(1);
  }
  let running = false;
  cron.schedule(
    expr,
    async () => {
      if (running) return log(`${name} is still running, skipping this run`);
      running = true;
      try {
        await runSafely(name);
      } finally {
        running = false;
      }
    },
    { timezone: TZ },
  );
  log(`${name} scheduled: "${expr}" (${TZ})`);
}

function start() {
  log("StockSafe worker started");
  schedule("retention", process.env.RETENTION_CRON?.trim() || "0 2 * * *");
  schedule("alerts", process.env.ALERT_CRON?.trim() || "30 6 * * *");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      log(`received ${signal}, exiting`);
      await db.$disconnect();
      process.exit(0);
    });
  }
}

if (mode === "once") void runOnce();
else start();
