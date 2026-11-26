// Role-based access rules. Pure and edge-safe (no database, no Node-only imports).

export const ROLES = ["STOREKEEPER", "PHARMACIST", "NURSE", "ADMIN", "AUDITOR"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  STOREKEEPER: "Store keeper",
  PHARMACIST: "Pharmacist",
  NURSE: "Ward nurse",
  ADMIN: "Admin / purchase officer",
  AUDITOR: "Auditor",
};

export const ADMIN_ONLY: readonly RoleName[] = ["ADMIN"];

export function isRole(value: unknown): value is RoleName {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type AccessResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; code: "UNAUTHENTICATED" | "FORBIDDEN" };

/**
 * `allowed` undefined means "any signed-in user". An empty list means nobody.
 * No (or unknown) role means the caller is not signed in: 401, not 403.
 */
export function checkAccess(
  role: string | null | undefined,
  allowed?: readonly RoleName[],
): AccessResult {
  if (!isRole(role)) return { ok: false, status: 401, code: "UNAUTHENTICATED" };
  if (allowed === undefined || allowed.includes(role)) return { ok: true };
  return { ok: false, status: 403, code: "FORBIDDEN" };
}
