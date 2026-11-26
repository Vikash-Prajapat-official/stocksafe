import { getTranslations } from "next-intl/server";
import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY, ROLES } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("adminUsers"))("title") };
}

export default async function UsersPage() {
  await requirePageUser(ADMIN_ONLY);
  const t = await getTranslations("adminUsers");
  const tc = await getTranslations("common");
  const tr = await getTranslations("roles");
  const [users, stores] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, role: true, active: true, stores: { select: { storeId: true } } },
    }),
    db.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const roleOptions = ROLES.map((r) => ({ value: r, label: tr(r) }));
  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));
  const rows = users.map(({ stores: us, ...u }) => ({ ...u, storeIds: us.map((s) => s.storeId) }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <CrudTable
        labels={{ add: t("add"), addTitle: t("add"), editTitle: t("edit"), none: t("none") }}
        endpoint="/api/admin/users"
        rows={rows}
        fields={[
          { key: "name", label: tc("name"), type: "text" },
          { key: "phone", label: tc("phone"), type: "text", hint: t("phoneHint") },
          { key: "password", label: t("password"), type: "password", hint: t("passwordHint") },
          { key: "role", label: tc("role"), type: "select", options: roleOptions },
          { key: "storeIds", label: t("stores"), type: "multiselect", options: storeOptions },
          { key: "active", label: tc("active"), type: "checkbox" },
        ]}
        columns={[
          { key: "name", label: tc("name") },
          { key: "phone", label: t("mobile") },
          { key: "role", label: tc("role"), kind: "option", options: roleOptions },
          { key: "storeIds", label: t("stores"), kind: "multi", options: storeOptions },
          { key: "active", label: tc("active"), kind: "bool" },
        ]}
      />
    </div>
  );
}
