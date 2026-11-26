import { getLocale, getTranslations } from "next-intl/server";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";
import { getSystemStatus } from "@/lib/system-status";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("system"))("title") };
}

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
  const t = await getTranslations("system");
  const locale = (await getLocale()) as Locale;
  const fmt = dateTimeFormat(intlTag(locale));
  const code = (c: React.ReactNode) => <code>{c}</code>;
  const s = await getSystemStatus();
  const ageHours = s.backups.latest ? Math.round((Date.now() - s.backups.latest.modified.getTime()) / 3_600_000) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t.rich("intro", { code })}</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">{t("backups")}</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label={t("latestBackup")}>
            {!s.backups.visible ? t("folderHidden") : s.backups.latest ? (
              <>
                <span className="tabular-nums">{fmt.format(s.backups.latest.modified)}</span> ({size(s.backups.latest.sizeBytes)})
                {ageHours !== null && ageHours > 26 ? <strong className="ml-2">{t("backupOld")}</strong> : null}
              </>
            ) : <strong>{t("noBackup")}</strong>}
          </Row>
          <Row label={t("backupsKept")}>{s.backups.visible ? t("keptCount", { count: s.backups.count }) : "-"}</Row>
          <Row label={t("encryption")}>{t.rich("encryptionText", { code })}</Row>
        </dl>
        {s.backups.files.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-700">{t("showFiles")}</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {s.backups.files.map((f) => <li key={f.name}>{f.name} · {size(f.sizeBytes)}</li>)}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("digest")}</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label={t("emailServer")}>{s.email.smtpConfigured ? t("smtpOn") : t("smtpOff")}</Row>
          <Row label={t("recipients")}>{s.email.recipients > 0 ? t("recipientsCount", { count: s.email.recipients }) : t("recipientsNone")}</Row>
          <Row label={t("lastSent")}>{s.jobs.sent ? <span className="tabular-nums">{fmt.format(s.jobs.sent.at)}</span> : t("never")}</Row>
          <Row label={t("lastFailure")}>{s.jobs.failed ? <><span className="tabular-nums">{fmt.format(s.jobs.failed.at)}</span> <span className="break-all text-xs text-neutral-500">{s.jobs.failed.entityId}</span></> : t("none")}</Row>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("jobs")}</h2>
        <dl className="divide-y rounded-lg border text-sm">
          <Row label={t("alertsJob")}>{s.jobs.alerts ? <span className="tabular-nums">{t("lastRun", { when: fmt.format(s.jobs.alerts.at) })}</span> : t("notRun")}</Row>
          <Row label={t("retentionJob")}>{s.jobs.retention ? <><span className="tabular-nums">{fmt.format(s.jobs.retention.at)}</span> <span className="text-xs text-neutral-500">{s.jobs.retention.entityId}</span></> : t("notRun")}</Row>
          <Row label={t("keptFor")}>{t("keptForText", { days: s.retentionDays })}</Row>
          <Row label={t("bands")}>{t("bandsText", { days: s.expiryBandDays.join(", ") })}</Row>
        </dl>
      </section>
    </div>
  );
}
