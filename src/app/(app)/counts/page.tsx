import Link from "next/link";
import { StartCountForm } from "@/components/count-actions";
import { Badge } from "@/components/ui/fields";
import { listCounts } from "@/lib/counts";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock counts · StockSafe" };

const LABEL = { OPEN: "Counting", SUBMITTED: "Waiting for approval", APPROVED: "Approved" } as const;

export default async function CountsPage() {
  const user = await requirePageUser(["STOREKEEPER", "ADMIN", "AUDITOR"]);
  const [counts, stores] = await Promise.all([listCounts(user), user.role === "AUDITOR" ? Promise.resolve([]) : userStores(user)]);
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Stock counts</h1>
        <p className="text-sm text-neutral-600">Count what is on the shelf, review the differences, and an admin approves the adjustment. Best done when the store is quiet.</p>
      </div>
      {stores.length > 0 ? <StartCountForm stores={stores} /> : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">No.</th>
              <th scope="col" className="px-3 py-2 font-medium">Store</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Batches</th>
              <th scope="col" className="px-3 py-2 font-medium">Started by</th>
              <th scope="col" className="px-3 py-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {counts.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-500">No counts yet.</td></tr>
            ) : (
              counts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium tabular-nums"><Link href={`/counts/${c.id}`} className="text-primary hover:underline">#{c.seq}</Link></td>
                  <td className="px-3 py-2">{c.store.name}</td>
                  <td className="px-3 py-2"><Badge tone={c.status === "APPROVED" ? "green" : "neutral"}>{LABEL[c.status]}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{c._count.lines}</td>
                  <td className="px-3 py-2">{c.starter.name}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt.format(c.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
