import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { isDemoMode } from "@/lib/demo";
import { LoginForm } from "./login-form";

const DEMO_ACCOUNTS = [
  ["ADMIN", "9000000001"],
  ["STOREKEEPER", "9000000002"],
  ["PHARMACIST", "9000000003"],
  ["NURSE", "9000000004"],
  ["AUDITOR", "9000000005"],
] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("login"))("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const t = await getTranslations("login");
  const td = await getTranslations("demo");
  const tr = await getTranslations("roles");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="mb-4 self-end">
        <LocaleSwitcher />
      </div>
      <h1 className="text-2xl font-semibold text-primary">StockSafe</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
      <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
      {isDemoMode() ? (
        <section aria-label={td("accountsTitle")} className="mt-8 rounded-lg border bg-neutral-50 p-4 text-sm">
          <h2 className="font-medium">{td("accountsTitle")}</h2>
          <p className="mt-1 text-neutral-600">{td("accountsHelp", { password: process.env.DEMO_PASSWORD ?? "ChangeMe@123" })}</p>
          <ul className="mt-2 space-y-1 tabular-nums">
            {DEMO_ACCOUNTS.map(([role, phone]) => (
              <li key={role} className="flex justify-between gap-3">
                <span>{tr(role)}</span>
                <span>{phone}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
