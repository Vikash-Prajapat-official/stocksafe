"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/fields";

type Row = { storeId: string; itemId: string; batchId: string; itemName: string; batchNo: string; quantity: number; unit: string; expired: boolean };
type Mode = "writeoff" | "return" | "transfer";

/**
 * Row actions in the expiry centre. Admin: write off (expired stock) or return to the supplier.
 * Store keeper / pharmacist working in that store: transfer not-yet-expired stock to another store.
 */
export function ExpiryActions({
  row,
  isAdmin,
  canTransfer,
  stores,
}: {
  row: Row;
  isAdmin: boolean;
  canTransfer: boolean;
  stores: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("expiryActions");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<Mode | null>(null);
  const [qty, setQty] = useState(String(row.quantity));
  const [text, setText] = useState("");
  const [dest, setDest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const destinations = stores.filter((s) => s.id !== row.storeId);

  const open = (m: Mode) => {
    setMode(m);
    setError(null);
    setQty(String(row.quantity));
    setText("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1 || n > row.quantity) return setError(t("qtyRange", { max: row.quantity }));
    let url: string, body: unknown;
    if (mode === "writeoff") {
      url = "/api/writeoff";
      body = { storeId: row.storeId, batchId: row.batchId, quantity: n, reason: text.trim() || undefined };
    } else if (mode === "return") {
      if (!text.trim()) return setError(t("needReturnReason"));
      url = "/api/returns";
      body = { storeId: row.storeId, batchId: row.batchId, quantity: n, reason: text.trim() };
    } else {
      if (!dest) return setError(t("needDest"));
      const destName = destinations.find((s) => s.id === dest)?.name ?? "";
      url = "/api/issue";
      body = {
        mode: "TRANSFER",
        fromStoreId: row.storeId,
        toStoreId: dest,
        reason: t("transferReason"),
        lines: [{ itemId: row.itemId, quantity: n, batchId: row.batchId, overrideReason: t("transferOverride", { store: destName }) }],
      };
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setError(data?.error?.message ?? t("failed"));
      }
      setMode(null);
      router.refresh();
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  const none = !(isAdmin || (canTransfer && !row.expired));
  if (none) return <span className="text-xs text-neutral-400">{t("noAction")}</span>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {isAdmin && row.expired ? <Button size="sm" variant="outline" onClick={() => open("writeoff")}>{t("writeoff")}</Button> : null}
        {isAdmin ? <Button size="sm" variant="outline" onClick={() => open("return")}>{t("return")}</Button> : null}
        {canTransfer && !row.expired ? <Button size="sm" variant="outline" onClick={() => open("transfer")}>{t("transfer")}</Button> : null}
      </div>
      {mode ? (
        <form onSubmit={submit} className="space-y-2 rounded-md border bg-neutral-50 p-3 text-sm">
          <div className="font-medium">
            {t("heading", { action: mode === "writeoff" ? t("writeoff") : mode === "return" ? t("return") : t("transfer"), item: row.itemName, batch: row.batchNo })}
          </div>
          <label className="flex items-center gap-2">
            {tc("quantity")} ({row.unit})
            <Input aria-label={tc("quantity")} inputMode="numeric" className="w-28 tabular-nums" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          {mode === "transfer" ? (
            <label className="flex items-center gap-2">
              {t("moveTo")}
              <Select aria-label={t("destination")} className="w-56" value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">{t("chooseStore")}</option>
                {destinations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </label>
          ) : (
            <label className="flex items-center gap-2">
              {mode === "return" ? t("reasonRequired") : t("reasonOptional")}
              <Input aria-label={tc("reason")} className="w-72" value={text} onChange={(e) => setText(e.target.value)} />
            </label>
          )}
          <FormError message={error} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>{busy ? tc("saving") : tc("confirm")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy}>{tc("cancel")}</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
