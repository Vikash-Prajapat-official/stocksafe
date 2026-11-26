import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers · StockSafe" };

export default async function SuppliersPage() {
  await requirePageUser(ADMIN_ONLY);
  const suppliers = await db.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Suppliers</h1>
      <CrudTable
        noun="supplier"
        endpoint="/api/admin/suppliers"
        rows={suppliers}
        fields={[
          { key: "name", label: "Name", type: "text" },
          { key: "phone", label: "Phone", type: "text" },
          { key: "gstin", label: "GSTIN", type: "text", hint: "15 characters, optional" },
          { key: "address", label: "Address", type: "text" },
        ]}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "gstin", label: "GSTIN" },
          { key: "address", label: "Address" },
        ]}
      />
    </div>
  );
}
