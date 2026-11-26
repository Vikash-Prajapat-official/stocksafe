import { IssueForm } from "@/components/issue-form";
import { requirePageUser } from "@/lib/session";
import { allActiveStores, userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Issue / transfer · StockSafe" };

export default async function IssuePage() {
  const user = await requirePageUser(["STOREKEEPER", "PHARMACIST"]);
  const [fromStores, allStores] = await Promise.all([userStores(user), allActiveStores()]);
  return (
    <div className="max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Issue / transfer</h1>
        <p className="text-sm text-neutral-600">
          Stock is taken from the earliest-expiry batch first. Expired batches are never used. You will see the batch split before you confirm.
        </p>
      </div>
      {fromStores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">You are not assigned to any store. Ask an admin to assign one.</p>
      ) : (
        <IssueForm fromStores={fromStores} allStores={allStores} />
      )}
    </div>
  );
}
