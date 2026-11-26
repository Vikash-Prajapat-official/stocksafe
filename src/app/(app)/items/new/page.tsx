import { ItemFormView } from "@/components/item-form";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const metadata = { title: "Add item · StockSafe" };

export default async function NewItemPage() {
  await requirePageUser(ADMIN_ONLY);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Add item</h1>
      <ItemFormView />
    </div>
  );
}
