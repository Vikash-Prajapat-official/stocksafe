import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stores · StockSafe" };

const TYPES = [
  { value: "MAIN", label: "Main store" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "WARD", label: "Ward" },
];

export default async function StoresPage() {
  await requirePageUser(ADMIN_ONLY);
  const stores = await db.store.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Stores</h1>
      <CrudTable
        noun="store"
        endpoint="/api/admin/stores"
        rows={stores}
        fields={[
          { key: "name", label: "Name", type: "text" },
          { key: "type", label: "Type", type: "select", options: TYPES },
          { key: "active", label: "Active", type: "checkbox" },
        ]}
        columns={[
          { key: "name", label: "Name" },
          { key: "type", label: "Type", kind: "option", options: TYPES },
          { key: "active", label: "Active", kind: "bool" },
        ]}
      />
    </div>
  );
}
