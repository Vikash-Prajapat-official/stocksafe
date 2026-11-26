import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

/** Admins can work in any store; everyone else only in the stores they are assigned to. */
export async function assertStoreAccess(user: SessionUser, storeId: string): Promise<void> {
  if (user.role === "ADMIN") return;
  const link = await db.userStore.findUnique({ where: { userId_storeId: { userId: user.id, storeId } }, select: { userId: true } });
  if (!link) throw new ApiError(403, "STORE_FORBIDDEN", "You are not assigned to this store.");
}

export type StoreOption = { id: string; name: string; type: "MAIN" | "PHARMACY" | "WARD" };

/** Active stores the user may work in (all active stores for an admin). */
export async function userStores(user: SessionUser): Promise<StoreOption[]> {
  return db.store.findMany({
    where: { active: true, ...(user.role === "ADMIN" ? {} : { users: { some: { userId: user.id } } }) },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });
}

/** All active stores (destinations for a transfer). */
export async function allActiveStores(): Promise<StoreOption[]> {
  return db.store.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true } });
}
