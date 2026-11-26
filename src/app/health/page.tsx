import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const s = await checkHealth();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-green-700">StockSafe</h1>
      <p className="mt-1 text-sm text-neutral-600">System health</p>
      <dl className="mt-6 divide-y rounded-lg border">
        <Row label="App" ok />
        <Row label="Database" ok={s.database === "ok"} />
      </dl>
      <p className="mt-4 text-xs text-neutral-500 tabular-nums">Checked {s.time}</p>
    </main>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt>{label}</dt>
      <dd className={ok ? "font-medium text-green-700" : "font-medium text-red-600"}>
        {ok ? "OK" : "Down"}
      </dd>
    </div>
  );
}
