import { getTranslations } from "next-intl/server";
import { DispenseForm } from "@/components/dispense-form";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("dispense"))("title") };
}

export default async function DispensePage() {
  const user = await requirePageUser(["PHARMACIST"]);
  const t = await getTranslations("dispense");
  const [stores, hospital] = await Promise.all([userStores(user), db.hospital.findFirst({ select: { name: true } })]);
  const retention = Number(process.env.RETENTION_DAYS);
  return (
    <div className="max-w-4xl space-y-4 print:max-w-none">
      <div className="space-y-1 print:hidden">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("intro")}</p>
      </div>
      {stores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{t("noStore")}</p>
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
