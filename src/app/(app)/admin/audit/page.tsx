import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { intlTag, type Locale } from "@/i18n/locale";
import { ButtonLink } from "@/components/ui/button";
import { isValidDay, listAudit, listAuditActions } from "@/lib/audit-query";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("audit"))("title") };
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; entity?: string; from?: string; to?: string; page?: string }>;
}) {
  await requirePageUser(["ADMIN", "AUDITOR"]);
  const t = await getTranslations("audit");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const sp = await searchParams;
  const dateOk = (d?: string) => (isValidDay(d) ? d : undefined);
  const filter = { actorId: sp.actor || undefined, action: sp.action || undefined, entity: sp.entity?.trim() || undefined, from: dateOk(sp.from), to: dateOk(sp.to) };
  const page = Math.max(1, Number(sp.page) || 1);
  const [log, users, actions] = await Promise.all([
    listAudit({ ...filter, page, pageSize: 50 }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listAuditActions(),
  ]);
  const pages = Math.max(1, Math.ceil(log.total / log.pageSize));
  const fmt = new Intl.DateTimeFormat(intlTag(locale), { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });
  const q = (p: number, extra: Record<string, string | undefined> = {}) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ actor: sp.actor, action: sp.action, entity: sp.entity, from: sp.from, to: sp.to, ...extra })) if (v) u.set(k, v);
    if (p > 1) u.set("page", String(p));
    return u.toString();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-neutral-600">{t("intro")}</p>
        </div>
        <ButtonLink href={`/api/admin/audit?format=csv${q(1) ? `&${q(1)}` : ""}`} variant="outline" prefetch={false}>{t("csv")}</ButtonLink>
      </div>

      <form action="/admin/audit" className="flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("user")}</span>
          <select name="actor" defaultValue={sp.actor ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("anyone")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("action")}</span>
          <select name="action" defaultValue={sp.action ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("anyAction")}</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("recordType")}</span>
          <input name="entity" defaultValue={sp.entity ?? ""} placeholder={t("recordPlaceholder")} className="w-36 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("from")}</span>
          <input name="from" type="date" defaultValue={filter.from ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("to")}</span>
          <input name="to" type="date" defaultValue={filter.to ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">{t("show")}</button>
      </form>

      <p className="text-sm text-neutral-600 tabular-nums">{t("count", { count: log.total })}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{tc("when")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("user")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("action")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("record")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ip")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {log.rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-neutral-500">{t("none")}</td></tr>
            ) : (
              log.rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt.format(r.at)}</td>
                  <td className="px-3 py-2">{r.actorName ?? <span className="text-neutral-500">{t("system")}</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-2 text-xs">{r.entity} <span className="break-all text-neutral-500">{r.entityId}</span></td>
                  <td className="px-3 py-2 tabular-nums">{r.ip ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/admin/audit?${q(page - 1)}`} className="text-primary hover:underline">← {t("newer")}</Link> : <span />}
          <span className="tabular-nums text-neutral-600">{t("pageOf", { page, pages })}</span>
          {page < pages ? <Link href={`/admin/audit?${q(page + 1)}`} className="text-primary hover:underline">{t("older")} →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
