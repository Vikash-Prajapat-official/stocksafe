import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { listItems } from "@/lib/items";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Items · StockSafe" };

const PAGE_SIZE = 50;
const num = "tabular-nums text-right";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string }>;
}) {
  const user = await requirePageUser();
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
        <h1 className="text-xl font-semibold">Items</h1>
        {isAdmin ? (
          <div className="flex gap-2">
            <ButtonLink href="/items/import" variant="outline">
              Import CSV / Excel
            </ButtonLink>
            <ButtonLink href="/items/new">Add item</ButtonLink>
          </div>
        ) : null}
      </div>

      <form action="/items" className="flex flex-wrap items-center gap-3" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, generic name or category"
          aria-label="Search items"
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} />
          Show inactive
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
          Search
        </button>
      </form>

      <p className="text-sm text-neutral-600 tabular-nums">
        {total} item{total === 1 ? "" : "s"}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Strength</th>
              <th scope="col" className="px-3 py-2 font-medium">Form</th>
              <th scope="col" className="px-3 py-2 font-medium">Unit</th>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>Min</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>Reorder</th>
              <th scope="col" className={`px-3 py-2 font-medium ${num}`}>Max</th>
              <th scope="col" className="px-3 py-2 font-medium">Tags</th>
              {isAdmin ? <th scope="col" className="px-3 py-2"><span className="sr-only">Edit</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 10 : 9} className="px-3 py-8 text-center text-neutral-500">
                  {q ? "No items match your search." : "No items yet."}
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
                  <td className="px-3 py-2">{i.form.charAt(0) + i.form.slice(1).toLowerCase()}</td>
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
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">Inactive</span>
                    )}
                  </td>
                  {isAdmin ? (
                    <td className="px-3 py-2 text-right">
                      <Link href={`/items/${i.id}`} className="text-primary hover:underline">
                        Edit
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
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-primary hover:underline">← Previous</Link> : <span />}
          <span className="tabular-nums text-neutral-600">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)} className="text-primary hover:underline">Next →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
