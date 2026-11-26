import { db } from "@/lib/db";

/** Reads RETENTION_DAYS: a whole number of days from 1 to 3650, otherwise 90. */
export function parseRetentionDays(env: string | undefined): number {
  const s = (env ?? "").trim();
  if (!/^\d+$/.test(s)) return 90;
  const n = Number(s);
  return n >= 1 && n <= 3650 ? n : 90;
}

/**
 * Clears patient names and tokens on dispensing records older than `days`. Only the side table
 * `movement_patient` is changed: the ledger (stock_movement) is never edited. Returns how many labels were cleared.
 */
export async function anonymisePatientLabels(opts: { days: number; now?: Date }): Promise<number> {
  if (!Number.isInteger(opts.days) || opts.days < 1) throw new RangeError("retention must be a whole number of days, 1 or more");
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.days * 86_400_000);
  const r = await db.movementPatient.updateMany({
    where: { anonymisedAt: null, label: { not: null }, createdAt: { lt: cutoff } },
    data: { label: null, anonymisedAt: now },
  });
  return r.count;
}
