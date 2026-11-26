import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { expiryBands } from "@/lib/alerts";
import { db } from "@/lib/db";
import { parseRetentionDays } from "@/lib/retention";

export type BackupFile = { name: string; sizeBytes: number; modified: Date };

/** What the admin "System" page shows: backups, email, retention and when the nightly jobs last ran. */
export async function getSystemStatus() {
  const dir = process.env.BACKUP_DIR?.trim() || ((process.env.DATABASE_URL ?? "").startsWith("file:") ? "backups" : "/backups");
  let files: BackupFile[] = [];
  let backupsVisible = true;
  try {
    const names = (await readdir(dir)).filter((n) => /^stocksafe-.*\.(sql|db)\.gz\.enc$/.test(n));
    const stats = await Promise.all(names.slice(-200).map(async (n) => ({ name: n, st: await stat(path.join(dir, n)) })));
    files = stats.map((x) => ({ name: x.name, sizeBytes: x.st.size, modified: x.st.mtime })).sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch {
    backupsVisible = false; // the backup folder is not mounted here (for example when running without Docker)
  }

  const lastRun = async (action: string) =>
    db.auditLog.findFirst({ where: { action }, orderBy: [{ at: "desc" }, { id: "desc" }], select: { at: true, entityId: true } });
  const [alerts, sent, failed, retention] = await Promise.all([lastRun("ALERT_JOB_RUN"), lastRun("DIGEST_SENT"), lastRun("DIGEST_FAILED"), lastRun("RETENTION_RUN")]);

  const recipients = (process.env.DIGEST_TO ?? "").split(",").filter((s) => /^[^\s@]+@[^\s@]+$/.test(s.trim())).length;
  return {
    backups: { dir, visible: backupsVisible, files: files.slice(0, 20), count: files.length, latest: files[0] ?? null },
    email: { smtpConfigured: Boolean(process.env.SMTP_URL?.trim()), recipients },
    retentionDays: parseRetentionDays(process.env.RETENTION_DAYS),
    expiryBandDays: expiryBands().slice(1).map((b) => b.maxDays),
    jobs: { alerts, sent, failed, retention },
  };
}
