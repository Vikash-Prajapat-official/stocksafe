import { DispenseForm } from "@/components/dispense-form";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dispense · StockSafe" };

export default async function DispensePage() {
  const user = await requirePageUser(["PHARMACIST"]);
  const [stores, hospital] = await Promise.all([userStores(user), db.hospital.findFirst({ select: { name: true } })]);
  const retention = Number(process.env.RETENTION_DAYS);
  return (
    <div className="max-w-4xl space-y-4 print:max-w-none">
      <div className="space-y-1 print:hidden">
        <h1 className="text-xl font-semibold">Dispense</h1>
        <p className="text-sm text-neutral-600">Earliest-expiry batch first. Expired batches are never dispensed.</p>
      </div>
      {stores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">You are not assigned to any store. Ask an admin to assign one.</p>
      ) : (
        <DispenseForm
          stores={stores}
          hospitalName={hospital?.name ?? "StockSafe"}
          userName={user.name}
          retentionDays={Number.isInteger(retention) && retention > 0 ? retention : 90}
        />
      )}
    </div>
  );
}
