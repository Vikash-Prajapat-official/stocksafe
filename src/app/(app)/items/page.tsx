import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { listItems } from "@/lib/items";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("items"))("title") };
}

const PAGE_SIZE = 50;
const num = "tabular-nums text-right";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string }>;
}) {
  const user = await requirePageUser();
  const t = await getTranslations("items");
  const tc = await getTranslations("common");
  const tf = await getTranslations("forms");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const showInactive = sp.inactive === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total } = await listItems({
    q,
    page,
    pageSize: PAGE_SIZE,
    active: showInactive ? undefined : true,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isAdmin = user.role === "ADMIN";

  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (showInactive) u.set("inactive", "1");
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/items?${s}` : "/items";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {isAdmin ? (
          <div className="flex gap-2">
            <ButtonLink href="/items/import" variant="outline">
              {t("import")}
            </ButtonLink>
            <ButtonLink href="/items/new">{t("add")}</ButtonLink>
          </div>
        ) : null}
      </div>

      <form action="/items" className="flex flex-wrap items-center gap-3" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} />
          {t("showInactive")}
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
          {tc("search")}
        </button>
      </form>

      <p className="text-sm text-neutral-600 tabular-nums">{t("count", { count: total })}</p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{tc("name")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("strength")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("form")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("unit")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("category")}</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>{t("min")}</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>{t("reorder")}</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>{t("max")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("tags")}</th>
              {isAdmin ? <th scope="col" className="px-3 py-2"><span className="sr-only">{tc("edit")}</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 10 : 9} className="px-3 py-8 text-center text-neutral-500">
                  {q ? t("noMatch") : t("none")}
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className={i.active ? undefined : "text-neutral-400"}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/items/${i.id}`} className="hover:underline">
                      {i.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{i.strength ?? ""}</td>
                  <td className="px-3 py-2">{tf(i.form)}</td>
                  <td className="px-3 py-2">{i.unit}</td>
                  <td className="px-3 py-2">{i.category ?? ""}</td>
                  <td className={`px-3 py-2 ${num}`}>{i.minLevel}</td>
                  <td className={`px-3 py-2 ${num}`}>{i.reorderLevel}</td>
                  <td className={`px-3 py-2 ${num}`}>{i.maxLevel}</td>
                  <td className="space-x-1 px-3 py-2">
                    {i.isEssential ? (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-800">NLEM</span>
                    ) : null}
                    {i.storage === "COLD" ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">2–8 °C</span>
                    ) : null}
                    {i.active ? null : (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{tc("inactive")}</span>
                    )}
                  </td>
                  {isAdmin ? (
                    <td className="px-3 py-2 text-right">
                      <Link href={`/items/${i.id}`} className="text-primary hover:underline">
                        {tc("edit")}
                      </Link>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-primary hover:underline">← {tc("previous")}</Link> : <span />}
          <span className="tabular-nums text-neutral-600">{t("pageOf", { page, pages })}</span>
          {page < pages ? <Link href={href(page + 1)} className="text-primary hover:underline">{tc("next")} →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
