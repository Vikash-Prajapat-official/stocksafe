import { getTranslations } from "next-intl/server";
import { ImportForm } from "@/components/import-form";
import { ButtonLink } from "@/components/ui/button";
import { MAX_IMPORT_ROWS } from "@/lib/item-import";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getTranslations("itemImport"))("title") };
}

export default async function ImportItemsPage() {
  await requirePageUser(ADMIN_ONLY);
  const t = await getTranslations("itemImport");
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="space-y-2 text-sm text-neutral-700">
        <p>{t.rich("intro", { b: (c) => <b>{c}</b> })}</p>
        <p>{t.rich("rules", { max: MAX_IMPORT_ROWS, b: (c) => <b>{c}</b> })}</p>
        <ButtonLink href="/api/items/import/template" variant="outline" size="sm" prefetch={false}>
          {t("template")}
        </ButtonLink>
      </div>
      <ImportForm />
    </div>
  );
}
