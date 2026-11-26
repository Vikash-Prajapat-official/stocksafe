import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/fields";
import { INDENT_STATUS_LABEL, type IndentStatus } from "@/lib/indent-flow";
import { listIndents } from "@/lib/indents";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Indents · StockSafe" };

const ORDER: IndentStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIAL", "ISSUED", "REJECTED"];
const tone = (s: IndentStatus) => (s === "REJECTED" || s === "DRAFT" || s === "SUBMITTED" ? "neutral" : "green");

export default async function IndentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser(["NURSE", "STOREKEEPER", "ADMIN", "AUDITOR"]);
  const sp = await searchParams;
  const status = ORDER.find((s) => s === sp.status);
  const [indents] = await Promise.all([listIndents({ user, status })]);
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Indents</h1>
          <p className="text-sm text-neutral-600">
            {user.role === "NURSE" ? "Ask the store for stock for your ward." : user.role === "STOREKEEPER" ? "Requests from the wards to your store." : "All ward requests."}
          </p>
        </div>
        {user.role === "NURSE" ? <ButtonLink href="/indents/new">New indent</ButtonLink> : null}
      </div>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        <Link href="/indents" aria-current={!status ? "page" : undefined} className={`rounded-lg border px-3 py-1.5 text-sm ${!status ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>All</Link>
        {ORDER.filter((s) => user.role !== "STOREKEEPER" || s !== "DRAFT").map((s) => (
          <Link key={s} href={`/indents?status=${s}`} aria-current={status === s ? "page" : undefined} className={`rounded-lg border px-3 py-1.5 text-sm ${status === s ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
            {INDENT_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">No.</th>
              <th scope="col" className="px-3 py-2 font-medium">Ward</th>
              <th scope="col" className="px-3 py-2 font-medium">Asked of</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Items</th>
              <th scope="col" className="px-3 py-2 font-medium">Raised by</th>
              <th scope="col" className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {indents.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">No indents{status ? ` that are ${INDENT_STATUS_LABEL[status].toLowerCase()}` : " yet"}.</td></tr>
            ) : (
              indents.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 font-medium tabular-nums"><Link href={`/indents/${i.id}`} className="text-primary hover:underline">#{i.seq}</Link></td>
                  <td className="px-3 py-2">{i.fromStore.name}</td>
                  <td className="px-3 py-2">{i.toStore.name}</td>
                  <td className="px-3 py-2"><Badge tone={tone(i.status)}>{INDENT_STATUS_LABEL[i.status]}</Badge></td>
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
