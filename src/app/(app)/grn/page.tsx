import { GrnForm } from "@/components/grn-form";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receive stock · StockSafe" };

export default async function GrnPage() {
  const user = await requirePageUser(["STOREKEEPER"]);
  const [stores, suppliers, recent] = await Promise.all([
    userStores(user),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.grn.findMany({
      orderBy: { receivedAt: "desc" },
      take: 15,
      include: { supplier: { select: { name: true } }, receiver: { select: { name: true } } },
    }),
  ]);
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Receive stock (GRN)</h1>
        <p className="text-sm text-neutral-600">Batch number and expiry date are required for every line. Scan the pack to fill them in.</p>
      </div>
      {stores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">You are not assigned to any store. Ask an admin to assign one.</p>
      ) : suppliers.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">Add a supplier first (Admin, Suppliers).</p>
      ) : (
        <GrnForm stores={stores} suppliers={suppliers} today={todayIST()} />
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Recent receipts</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Received</th>
                <th scope="col" className="px-3 py-2 font-medium">Supplier</th>
                <th scope="col" className="px-3 py-2 font-medium">Invoice</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recent.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No receipts yet.</td></tr>
              ) : (
                recent.map((g) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 tabular-nums">{fmt.format(g.receivedAt)}</td>
                    <td className="px-3 py-2">{g.supplier.name}</td>
                    <td className="px-3 py-2">{g.invoiceNo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPaise(g.totalPaise)}</td>
                    <td className="px-3 py-2">{g.receiver.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
