"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Select } from "@/components/ui/fields";

/** Start a stock count for one store. */
export function StartCountForm({ stores }: { stores: { id: string; name: string }[] }) {
  const router = useRouter();
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
      setError(data?.error?.message ?? "Could not start the count.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Store to count" htmlFor="count-store">
        <Select id="count-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-64">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Button onClick={() => void start()} disabled={busy || !storeId}>{busy ? "Starting..." : "Start a count"}</Button>
      <div className="basis-full"><FormError message={error} /></div>
    </div>
  );
}

/** Admin: approve a submitted count (writes the adjustments) or send it back for a recount. */
export function CountDecision({ id, netUnits, lossText }: { id: string; netUnits: number; lossText: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setError(data?.error?.message ?? "Something went wrong. Nothing was changed.");
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Decision" className="space-y-3 rounded-lg border bg-neutral-50 p-4">
      <p className="text-sm text-neutral-700">
        Approving changes the stock in the system to match the count ({netUnits === 0 ? "no net change in units" : `net ${netUnits > 0 ? "+" : "−"}${Math.abs(netUnits)} units`}, {lossText}). Each change is recorded in the ledger as an adjustment with your name as approver. This cannot be undone, only corrected by another adjustment.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => window.confirm("Approve this count and adjust the stock?") && void call(`/api/counts/${id}/approve`, { method: "POST" })}
        >
          {busy ? "Working..." : "Approve and adjust stock"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void call(`/api/counts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen" }) })}
        >
          Send back for a recount
        </Button>
      </div>
      <FormError message={error} />
    </section>
  );
}
