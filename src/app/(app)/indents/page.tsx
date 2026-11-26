import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/fields";
import type { IndentStatus } from "@/lib/indent-flow";
import { listIndents } from "@/lib/indents";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("indents"))("title") };
}

const ORDER: IndentStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIAL", "ISSUED", "REJECTED"];
const tone = (s: IndentStatus) => (s === "REJECTED" || s === "DRAFT" || s === "SUBMITTED" ? "neutral" : "green");

export default async function IndentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser(["NURSE", "STOREKEEPER", "ADMIN", "AUDITOR"]);
  const t = await getTranslations("indents");
  const tc = await getTranslations("common");
  const ts = await getTranslations("indentStatus");
  const locale = (await getLocale()) as Locale;
  const sp = await searchParams;
  const status = ORDER.find((s) => s === sp.status);
  const [indents] = await Promise.all([listIndents({ user, status })]);
  const fmt = dateTimeFormat(intlTag(locale));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-neutral-600">
            {user.role === "NURSE" ? t("introNurse") : user.role === "STOREKEEPER" ? t("introStore") : t("introAll")}
          </p>
        </div>
        {user.role === "NURSE" ? <ButtonLink href="/indents/new">{t("new")}</ButtonLink> : null}
      </div>

      <nav aria-label={tc("status")} className="flex flex-wrap gap-2">
        <Link href="/indents" aria-current={!status ? "page" : undefined} className={`rounded-lg border px-3 py-1.5 text-sm ${!status ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>{tc("all")}</Link>
        {ORDER.filter((s) => user.role !== "STOREKEEPER" || s !== "DRAFT").map((s) => (
          <Link key={s} href={`/indents?status=${s}`} aria-current={status === s ? "page" : undefined} className={`rounded-lg border px-3 py-1.5 text-sm ${status === s ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
            {ts(s)}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t("no")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ward")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("askedOf")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("status")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{tc("items")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("raisedBy")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("when")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {indents.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">{status ? t("noneStatus", { status: ts(status) }) : t("none")}</td></tr>
            ) : (
              indents.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 font-medium tabular-nums"><Link href={`/indents/${i.id}`} className="text-primary hover:underline">#{i.seq}</Link></td>
                  <td className="px-3 py-2">{i.fromStore.name}</td>
                  <td className="px-3 py-2">{i.toStore.name}</td>
                  <td className="px-3 py-2"><Badge tone={tone(i.status)}>{ts(i.status)}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{i._count.lines}</td>
                  <td className="px-3 py-2">{i.creator.name}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt.format(i.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
