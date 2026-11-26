import { getTranslations } from "next-intl/server";
import { IndentNewForm } from "@/components/indent-new-form";
import { requirePageUser } from "@/lib/session";
import { allActiveStores, userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("indentNew"))("title") };
}

export default async function NewIndentPage() {
  const user = await requirePageUser(["NURSE"]);
  const t = await getTranslations("indentNew");
  const [wards, stores] = await Promise.all([userStores(user), allActiveStores()]);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("intro")}</p>
      </div>
      {wards.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{t("noWard")}</p>
      ) : (
        <IndentNewForm wards={wards} suppliers={stores} />
      )}
    </div>
  );
}
