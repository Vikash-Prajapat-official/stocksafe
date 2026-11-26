import { getTranslations } from "next-intl/server";
import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("adminSuppliers"))("title") };
}

export default async function SuppliersPage() {
  await requirePageUser(ADMIN_ONLY);
  const t = await getTranslations("adminSuppliers");
  const tc = await getTranslations("common");
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <CrudTable
        labels={{ add: t("add"), addTitle: t("add"), editTitle: t("edit"), none: t("none") }}
        endpoint="/api/admin/suppliers"
        rows={suppliers}
        fields={[
          { key: "name", label: tc("name"), type: "text" },
          { key: "phone", label: t("phone"), type: "text" },
          { key: "gstin", label: "GSTIN", type: "text", hint: t("gstinHint") },
          { key: "address", label: t("address"), type: "text" },
        ]}
        columns={[
          { key: "name", label: tc("name") },
          { key: "phone", label: t("phone") },
          { key: "gstin", label: "GSTIN" },
          { key: "address", label: t("address") },
        ]}
      />
    </div>
  );
}
