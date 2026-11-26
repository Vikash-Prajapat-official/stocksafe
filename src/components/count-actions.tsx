"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Select } from "@/components/ui/fields";

/** Start a stock count for one store. */
export function StartCountForm({ stores }: { stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useTranslations("countActions");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/counts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId }) });
      const data = (await res.json().catch(() => null)) as { count?: { id: string }; error?: { message?: string; details?: { countId?: string } } } | null;
      if (res.ok && data?.count) {
        router.push(`/counts/${data.count.id}`);
        router.refresh();
        return;
      }
      const existing = data?.error?.details?.countId;
      if (existing) return router.push(`/counts/${existing}`);
      setError(data?.error?.message ?? t("startFailed"));
    } catch {
      setError(t("offlineShort"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={t("storeToCount")} htmlFor="count-store">
        <Select id="count-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-64">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Button onClick={() => void start()} disabled={busy || !storeId}>{busy ? t("starting") : t("start")}</Button>
      <div className="basis-full"><FormError message={error} /></div>
    </div>
  );
}

/** Admin: approve a submitted count (writes the adjustments) or send it back for a recount. */
export function CountDecision({ id, netUnits, lossText }: { id: string; netUnits: number; lossText: string }) {
  const router = useRouter();
  const t = useTranslations("countActions");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setError(data?.error?.message ?? t("failed"));
      }
      router.refresh();
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("decision")} className="space-y-3 rounded-lg border bg-neutral-50 p-4">
      <p className="text-sm text-neutral-700">
        {t("approveHelp", { net: netUnits === 0 ? t("noNet") : t("net", { sign: netUnits > 0 ? "+" : "−", n: Math.abs(netUnits) }), loss: lossText })}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => window.confirm(t("confirmApprove")) && void call(`/api/counts/${id}/approve`, { method: "POST" })}
        >
          {busy ? tc("working") : t("approve")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void call(`/api/counts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen" }) })}
        >
          {t("sendBack")}
        </Button>
      </div>
      <FormError message={error} />
    </section>
  );
}
