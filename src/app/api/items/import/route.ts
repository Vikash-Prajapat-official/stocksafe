import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { existingItemKeys } from "@/lib/items";
import { MAX_IMPORT_BYTES, importItemsFromBytes } from "@/lib/item-import";
import { ADMIN_ONLY } from "@/lib/rbac";

const CHUNK = 500;

// multipart/form-data with a "file" field (.csv, .xlsx, .xls). Add ?dryRun=true to only check.
// Valid rows are imported; every invalid row is reported with its row number and column.
export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "INVALID_BODY", "Send the file as multipart/form-data in a field named \"file\".");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "INVALID_BODY", "No file was uploaded.");
  if (file.size > MAX_IMPORT_BYTES)
    throw new ApiError(413, "FILE_TOO_LARGE", `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);

  const result = importItemsFromBytes(
    new Uint8Array(await file.arrayBuffer()),
    file.name,
    await existingItemKeys(),
  );
  if (result.fatal) throw new ApiError(400, "IMPORT_FAILED", result.fatal);

  let created = 0;
  if (!dryRun && result.items.length > 0) {
    created = await db.$transaction(async (tx) => {
      let n = 0;
      for (let i = 0; i < result.items.length; i += CHUNK) {
        const batch = result.items.slice(i, i + CHUNK).map((r) => r.data);
        n += (await tx.item.createMany({ data: batch })).count;
      }
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "ITEM_IMPORT",
        entity: "item",
        entityId: file.name.slice(0, 100),
        ip,
      });
      return n;
    });
  }

  return NextResponse.json({
    dryRun,
    created,
    wouldCreate: result.items.length,
    errors: result.errors,
    warnings: result.warnings,
    skippedBlank: result.skippedBlank,
    totalRows: result.totalRows,
  });
});
