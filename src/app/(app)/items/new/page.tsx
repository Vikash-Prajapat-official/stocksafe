import { getTranslations } from "next-intl/server";
import { ItemFormView } from "@/components/item-form";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getTranslations("items"))("add") };
}

export default async function NewItemPage() {
  await requirePageUser(ADMIN_ONLY);
  const t = await getTranslations("items");
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{t("add")}</h1>
      <ItemFormView />
    </div>
  );
}
