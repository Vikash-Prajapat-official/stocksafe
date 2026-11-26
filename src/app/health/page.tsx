import { getTranslations } from "next-intl/server";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const s = await checkHealth();
  const t = await getTranslations("health");
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-green-700">StockSafe</h1>
      <p className="mt-1 text-sm text-neutral-600">{t("title")}</p>
      <dl className="mt-6 divide-y rounded-lg border">
        <Row label={t("app")} ok yes={t("ok")} no={t("down")} />
        <Row label={t("database")} ok={s.database === "ok"} yes={t("ok")} no={t("down")} />
      </dl>
      <p className="mt-4 text-xs text-neutral-500 tabular-nums">{t("checked", { time: s.time })}</p>
    </main>
  );
}

function Row({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt>{label}</dt>
      <dd className={ok ? "font-medium text-green-700" : "font-medium text-red-600"}>
        {ok ? yes : no}
      </dd>
    </div>
  );
}
