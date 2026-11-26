import { getTranslations } from "next-intl/server";
import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("adminStores"))("title") };
}

export default async function StoresPage() {
  await requirePageUser(ADMIN_ONLY);
  const t = await getTranslations("adminStores");
  const tc = await getTranslations("common");
  const ty = await getTranslations("storeTypes");
  const TYPES = (["MAIN", "PHARMACY", "WARD"] as const).map((v) => ({ value: v, label: ty(v) }));
  const stores = await db.store.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <CrudTable
        labels={{ add: t("add"), addTitle: t("add"), editTitle: t("edit"), none: t("none") }}
        endpoint="/api/admin/stores"
        rows={stores}
        fields={[
          { key: "name", label: tc("name"), type: "text" },
          { key: "type", label: t("type"), type: "select", options: TYPES },
          { key: "active", label: tc("active"), type: "checkbox" },
        ]}
        columns={[
          { key: "name", label: tc("name") },
          { key: "type", label: t("type"), kind: "option", options: TYPES },
          { key: "active", label: tc("active"), kind: "bool" },
        ]}
      />
    </div>
  );
}
