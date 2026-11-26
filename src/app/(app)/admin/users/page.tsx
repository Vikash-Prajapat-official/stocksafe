import { CrudTable } from "@/components/crud-table";
import { db } from "@/lib/db";
import { ADMIN_ONLY, ROLES, ROLE_LABELS } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · StockSafe" };

export default async function UsersPage() {
  await requirePageUser(ADMIN_ONLY);
  const [users, stores] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, role: true, active: true, stores: { select: { storeId: true } } },
    }),
    db.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));
  const rows = users.map(({ stores: us, ...u }) => ({ ...u, storeIds: us.map((s) => s.storeId) }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <CrudTable
        noun="user"
        endpoint="/api/admin/users"
        rows={rows}
        fields={[
          { key: "name", label: "Name", type: "text" },
          { key: "phone", label: "Mobile number", type: "text", hint: "10 digits; used to sign in" },
          { key: "password", label: "Password", type: "password", hint: "At least 8 characters" },
          { key: "role", label: "Role", type: "select", options: roleOptions },
          { key: "storeIds", label: "Stores", type: "multiselect", options: storeOptions },
          { key: "active", label: "Active", type: "checkbox" },
        ]}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Mobile" },
          { key: "role", label: "Role", kind: "option", options: roleOptions },
          { key: "storeIds", label: "Stores", kind: "multi", options: storeOptions },
          { key: "active", label: "Active", kind: "bool" },
        ]}
      />
    </div>
  );
}
