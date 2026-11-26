// First-expiry-first-out. Pure functions only: no database, no clock (the caller passes `today`).

export type FefoBatch = { batchId: string; expiryDate: string | Date; quantity: number };
export type FefoPick = { batchId: string; quantity: number };
export type FefoResult =
  | { ok: true; picks: FefoPick[] }
  | { ok: false; requested: number; available: number; expired: number };

/** "YYYY-MM-DD" for a date string or a Date (UTC midnight, as Postgres DATE columns arrive). */
export function toDay(d: string | Date): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Today's date in India (IST, UTC+5:30), as YYYY-MM-DD. Hospitals count expiry by the local calendar day. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** A batch is usable on its expiry date and expired from the next day. */
export function isExpired(expiryDate: string | Date, today: string): boolean {
  return toDay(expiryDate) < today;
}

/**
 * Splits `requested` units across batches, earliest expiry first. Expired and empty batches are
 * never used. Ties on expiry take the smaller batch first (to clear it), then the lower batch id,
 * so the result is deterministic. Does not modify its input.
 */
export function splitFefo(batches: readonly FefoBatch[], requested: number, today: string): FefoResult {
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new RangeError("requested quantity must be a positive whole number");
  }

  let expired = 0;
  const usable: { batchId: string; day: string; quantity: number }[] = [];
  for (const b of batches) {
    if (b.quantity <= 0) continue;
    const day = toDay(b.expiryDate);
    if (day < today) expired += b.quantity;
    else usable.push({ batchId: b.batchId, day, quantity: b.quantity });
  }
  usable.sort(
    (a, b) =>
      (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
      a.quantity - b.quantity ||
      (a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0),
  );

  const picks: FefoPick[] = [];
  let remaining = requested;
  for (const b of usable) {
    if (remaining === 0) break;
    const take = Math.min(b.quantity, remaining);
    picks.push({ batchId: b.batchId, quantity: take });
    remaining -= take;
  }
  if (remaining > 0) {
    return { ok: false, requested, available: usable.reduce((s, b) => s + b.quantity, 0), expired };
  }
  return { ok: true, picks };
}
