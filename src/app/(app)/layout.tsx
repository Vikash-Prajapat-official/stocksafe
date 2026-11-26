import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { signOut } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { requirePageUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tr = await getTranslations("roles");
  const td = await getTranslations("demo");
  const links = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/items", label: t("items") },
    { href: "/expiry", label: t("expiry") },
    { href: "/reorder", label: t("reorder") },
    ...(user.role === "STOREKEEPER" ? [{ href: "/grn", label: t("grn") }] : []),
    ...(user.role === "STOREKEEPER" || user.role === "PHARMACIST" ? [{ href: "/issue", label: t("issue") }] : []),
    ...(user.role === "PHARMACIST" ? [{ href: "/dispense", label: t("dispense") }] : []),
    ...(["NURSE", "STOREKEEPER", "ADMIN", "AUDITOR"].includes(user.role) ? [{ href: "/indents", label: t("indents") }] : []),
    ...(["STOREKEEPER", "ADMIN", "AUDITOR"].includes(user.role) ? [{ href: "/counts", label: t("counts") }] : []),
    ...(["ADMIN", "AUDITOR"].includes(user.role) ? [{ href: "/reports", label: t("reports") }, { href: "/admin/audit", label: t("audit") }] : []),
    ...(user.role === "ADMIN"
      ? [
          { href: "/admin/stores", label: t("stores") },
          { href: "/admin/users", label: t("users") },
          { href: "/admin/suppliers", label: t("suppliers") },
          { href: "/admin/system", label: t("system") },
        ]
      : []),
  ];

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      {isDemoMode() ? (
        <p role="note" className="bg-neutral-900 px-4 py-2 text-center text-sm text-white print:hidden">
          {td("banner")}
        </p>
      ) : null}
      <header className="border-b bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold text-primary">
            StockSafe
          </Link>
          <nav aria-label={t("main")} className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-neutral-700 hover:text-primary hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <LocaleSwitcher />
            <span className="text-neutral-600">
              {user.name} <span className="text-neutral-400">({tr(user.role)})</span>
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                {tc("signOut")}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
