import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";

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
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="mb-4 self-end">
        <LocaleSwitcher />
      </div>
      <h1 className="text-2xl font-semibold text-primary">StockSafe</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
      <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
    </main>
  );
}
