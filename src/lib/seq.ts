import { isSqlite } from "@/lib/dialect";

type Agg = { aggregate(args: { _max: { seq: true } }): Promise<{ _max: { seq: number | null } }> };
type Client = { stockMovement: Agg; indent: Agg; stockCount: Agg };

/**
 * The human/insertion-order number for a new row. PostgreSQL fills `seq` from a sequence, so this returns undefined
 * there. SQLite cannot auto-number a non-key column, so the next number is computed here; that is safe because
 * SQLite mode runs on a single connection, so only one write transaction is active at a time.
 */
export async function nextSeq(client: unknown, model: "stockMovement" | "indent" | "stockCount"): Promise<number | undefined> {
  if (!isSqlite) return undefined;
  const r = await (client as Client)[model].aggregate({ _max: { seq: true } });
  return (r._max.seq ?? 0) + 1;
}
