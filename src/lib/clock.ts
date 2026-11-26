// A way to stamp stock movements, receipts and audit rows with a past moment. Used ONLY to build the demo history
// (prisma/demo-history.ts) and in tests: real requests never call it, so everything real is stamped "now".

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ at: Date }>();

/** Runs `fn`; every ledger row, receipt and audit entry written inside it carries `at` instead of the current time. */
export function withMovementTime<T>(at: Date, fn: () => Promise<T>): Promise<T> {
  return store.run({ at }, fn);
}

/** The time to stamp a new row with, or undefined to let the database use "now". */
export function stampTime(): Date | undefined {
  return store.getStore()?.at;
}
