import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { requirePageUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const links = [
    { href: "/items", label: "Items" },
    ...(user.role === "ADMIN"
      ? [
          { href: "/admin/stores", label: "Stores" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/suppliers", label: "Suppliers" },
        ]
      : []),
  ];

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/items" className="text-lg font-semibold text-primary">
            StockSafe
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-neutral-700 hover:text-primary hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-neutral-600">
              {user.name} <span className="text-neutral-400">({ROLE_LABELS[user.role]})</span>
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
