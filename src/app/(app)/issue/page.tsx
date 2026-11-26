import { getTranslations } from "next-intl/server";
import { IssueForm } from "@/components/issue-form";
import { requirePageUser } from "@/lib/session";
import { allActiveStores, userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("issue"))("title") };
}

export default async function IssuePage() {
  const user = await requirePageUser(["STOREKEEPER", "PHARMACIST"]);
  const t = await getTranslations("issue");
  const [fromStores, allStores] = await Promise.all([userStores(user), allActiveStores()]);
  return (
    <div className="max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">
          {t("intro")}
        </p>
      </div>
      {fromStores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{t("noStore")}</p>
      ) : (
        <IssueForm fromStores={fromStores} allStores={allStores} />
      )}
    </div>
  );
}
