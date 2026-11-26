import { IndentNewForm } from "@/components/indent-new-form";
import { requirePageUser } from "@/lib/session";
import { allActiveStores, userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "New indent · StockSafe" };

export default async function NewIndentPage() {
  const user = await requirePageUser(["NURSE"]);
  const [wards, stores] = await Promise.all([userStores(user), allActiveStores()]);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">New indent</h1>
        <p className="text-sm text-neutral-600">Ask the store for stock for your ward. The store can approve all of it, part of it, or none.</p>
      </div>
      {wards.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">You are not assigned to a ward. Ask an admin to assign one.</p>
      ) : (
        <IndentNewForm wards={wards} suppliers={stores} />
      )}
    </div>
  );
}
