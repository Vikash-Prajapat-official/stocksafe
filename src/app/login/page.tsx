import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · StockSafe" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold text-primary">StockSafe</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">Sign in with your mobile number.</p>
      <LoginForm callbackUrl={callbackUrl ?? "/items"} />
    </main>
  );
}
