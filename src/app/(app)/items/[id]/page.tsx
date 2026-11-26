import { notFound } from "next/navigation";
import { ItemFormView } from "@/components/item-form";
import Link from "next/link";
import { StockTable } from "@/components/stock-table";
import { db } from "@/lib/db";
import { getStockRows } from "@/lib/ledger";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const item = await db.item.findUnique({ where: { id } });
  if (!item) notFound();
  const stock = await getStockRows({ itemId: id });
  const stockSection = (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Stock on hand</h2>
        <Link href={`/items/${id}/ledger`} className="text-sm text-primary hover:underline">View ledger (bin card)</Link>
      </div>
      <StockTable rows={stock} />
    </section>
  );

  if (user.role === "ADMIN") {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Edit item</h1>
        <ItemFormView initial={item} />
        {stockSection}
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Generic name", item.genericName ?? ""],
    ["Strength", item.strength ?? ""],
    ["Form", item.form],
    ["Unit", item.unit],
    ["Category", item.category ?? ""],
    ["Essential (NLEM)", item.isEssential ? "Yes" : "No"],
    ["Storage", item.storage === "COLD" ? "Cold chain (2 to 8 °C)" : "Room temperature"],
    ["Minimum / reorder / maximum", `${item.minLevel} / ${item.reorderLevel} / ${item.maxLevel}`],
  ];
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">{item.name}</h1>
      <dl className="divide-y rounded-lg border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2">
            <dt className="text-neutral-600">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {stockSection}
    </div>
  );
}
