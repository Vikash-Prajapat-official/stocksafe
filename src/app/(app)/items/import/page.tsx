import { ImportForm } from "@/components/import-form";
import { ButtonLink } from "@/components/ui/button";
import { MAX_IMPORT_ROWS } from "@/lib/item-import";
import { ADMIN_ONLY } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export const metadata = { title: "Import items · StockSafe" };

export default async function ImportItemsPage() {
  await requirePageUser(ADMIN_ONLY);
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Import items</h1>
      <div className="space-y-2 text-sm text-neutral-700">
        <p>
          Upload a CSV or Excel file. Required columns: <b>name</b> and <b>form</b> (tablet, capsule, injection,
          syrup, ointment, drops, consumable, other). Optional: generic_name, strength, unit, category,
          is_essential, storage (ROOM or COLD), min_level, reorder_level, max_level.
        </p>
        <p>
          Up to {MAX_IMPORT_ROWS} rows. Blank rows are skipped. Rows with problems are listed with their row number
          and are not imported; the good rows are. Items that already exist (same name, strength and form) are
          skipped. Use <b>Check file</b> first to see problems without importing.
        </p>
        <ButtonLink href="/api/items/import/template" variant="outline" size="sm" prefetch={false}>
          Download CSV template
        </ButtonLink>
      </div>
      <ImportForm />
    </div>
  );
}
