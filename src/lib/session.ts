import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkAccess, type RoleName } from "@/lib/rbac";

export type SessionUser = { id: string; name: string; role: RoleName };

/**
 * The signed-in user, read fresh from the database on every call so that a deactivated
 * user or a changed role takes effect immediately (the JWT alone is never trusted for role).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, role: user.role };
}

/** For server-rendered pages: redirect to /login, or home when the role is not allowed. */
export async function requirePageUser(allowed?: readonly RoleName[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!checkAccess(user.role, allowed).ok) redirect("/items");
  return user;
}
