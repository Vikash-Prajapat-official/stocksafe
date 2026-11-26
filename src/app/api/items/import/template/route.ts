import { route } from "@/lib/api";
import { templateCsv } from "@/lib/item-import";
import { ADMIN_ONLY } from "@/lib/rbac";

export const GET = route(ADMIN_ONLY, async () => {
  return new Response(templateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stocksafe-items-template.csv"',
    },
  });
});
