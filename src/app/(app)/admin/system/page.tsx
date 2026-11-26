import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";
import { getSystemStatus } from "@/lib/system-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "System · StockSafe" };

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 px-4 py-2">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function SystemPage() {
  await requirePageUser(ADMIN_ONLY);
  const s = await getSystemStatus();
  const ageHours = s.backups.latest ? Math.round((Date.now() - s.backups.latest.modified.getTime()) / 3_600_000) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">System</h1>
        <p className="text-sm text-neutral-600">Backups, email and the nightly jobs. Nothing here can be changed from the screen: settings live in the <code>.env</code> file.</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Backups</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label="Latest backup">
            {!s.backups.visible ? "The backup folder is not visible to the app" : s.backups.latest ? (
              <>
                <span className="tabular-nums">{fmt.format(s.backups.latest.modified)}</span> ({size(s.backups.latest.sizeBytes)})
                {ageHours !== null && ageHours > 26 ? <strong className="ml-2">Older than a day: check the backup service</strong> : null}
              </>
            ) : <strong>No backup yet</strong>}
          </Row>
          <Row label="Backups kept">{s.backups.visible ? `${s.backups.count} (the last 14 days)` : "-"}</Row>
          <Row label="Encryption">AES-256, with the BACKUP_PASSPHRASE from <code>.env</code>. Keep that passphrase safe: without it a backup cannot be opened.</Row>
        </dl>
        {s.backups.files.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-700">Show the backup files</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {s.backups.files.map((f) => <li key={f.name}>{f.name} · {size(f.sizeBytes)}</li>)}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Email digest</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label="Email server">{s.email.smtpConfigured ? "Set up (SMTP_URL)" : "Not set up. The digest is skipped."}</Row>
          <Row label="Recipients">{s.email.recipients > 0 ? `${s.email.recipients} address${s.email.recipients === 1 ? "" : "es"} (DIGEST_TO)` : "None (DIGEST_TO is empty)"}</Row>
          <Row label="Last digest sent">{s.jobs.sent ? <span className="tabular-nums">{fmt.format(s.jobs.sent.at)}</span> : "Never"}</Row>
          <Row label="Last digest failure">{s.jobs.failed ? <><span className="tabular-nums">{fmt.format(s.jobs.failed.at)}</span> <span className="break-all text-xs text-neutral-500">{s.jobs.failed.entityId}</span></> : "None"}</Row>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Nightly jobs</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label="Alerts (every morning, 06:30)">{s.jobs.alerts ? <span className="tabular-nums">Last run {fmt.format(s.jobs.alerts.at)}</span> : "Has not run yet"}</Row>
          <Row label="Patient-name retention (every night, 02:00)">{s.jobs.retention ? <><span className="tabular-nums">{fmt.format(s.jobs.retention.at)}</span> <span className="text-xs text-neutral-500">{s.jobs.retention.entityId}</span></> : "Has not run yet"}</Row>
          <Row label="Patient names kept for">{s.retentionDays} days, then cleared (RETENTION_DAYS)</Row>
          <Row label="Expiry bands">{s.expiryBandDays.join(", ")} days (EXPIRY_ALERT_DAYS)</Row>
        </dl>
      </section>
    </div>
  );
}
