"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/fields";

type Line = {
  id: string;
  itemName: string;
  strength: string | null;
  unit: string;
  batchNo: string;
  expiryDate: string;
  systemQty: number;
  countedQty: number | null;
};

/**
 * The count sheet, laid out for a phone: one card per batch, a big number box, and progress that is saved on
 * demand. The system quantity is hidden by default (a "blind" count is more honest); tick the box to see it.
 */
export function CountSheet({ countId, lines }: { countId: string; lines: Line[] }) {
  const router = useRouter();
  const t = useTranslations("countSheet");
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.countedQty === null ? "" : String(l.countedQty)])));
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [q, setQ] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counted = lines.filter((l) => /^\d+$/.test((values[l.id] ?? "").trim())).length; // only real numbers count as counted
  const dirty = lines.filter((l) => (values[l.id] ?? "") !== (saved[l.id] ?? ""));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? lines.filter((l) => `${l.itemName} ${l.strength ?? ""} ${l.batchNo}`.toLowerCase().includes(needle)) : lines;
  }, [lines, q]);

  function payload() {
    const out: { lineId: string; countedQty: number | null }[] = [];
    for (const l of dirty) {
      const raw = (values[l.id] ?? "").trim();
      if (raw === "") out.push({ lineId: l.id, countedQty: null });
      else if (/^\d+$/.test(raw) && Number(raw) <= 10_000_000) out.push({ lineId: l.id, countedQty: Number(raw) });
      else {
        setError(t("needNumber", { item: l.itemName, batch: l.batchNo }));
        return null;
      }
    }
    return out;
  }

  async function save(): Promise<boolean> {
    setError(null);
    const body = payload();
    if (!body) return false;
    if (body.length === 0) return true;
    const res = await fetch(`/api/counts/${countId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: body }) });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? t("saveFailed"));
      return false;
    }
    setSaved({ ...values });
    return true;
  }

  async function onSave() {
    setBusy(true);
    setInfo(null);
    try {
      if (await save()) setInfo(t("saved", { counted, total: lines.length }));
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (counted === 0) return setError(t("needOne"));
    const left = lines.length - counted;
    if (left > 0 && !window.confirm(t("confirmSubmit", { left }))) return;
    setBusy(true);
    setInfo(null);
    try {
      if (!(await save())) return;
      const res = await fetch(`/api/counts/${countId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setError(data?.error?.message ?? t("submitFailed"));
      }
      router.refresh();
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium tabular-nums" aria-live="polite">{t("progress", { counted, total: lines.length })}</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
            {t("showSystem")}
          </label>
        </div>
        <Input aria-label={t("find")} placeholder={t("find")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ul className="space-y-3">
        {shown.map((l) => (
          <li key={l.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.strength ? `${l.itemName} ${l.strength}` : l.itemName}</div>
                <div className="text-sm text-neutral-600">
                  {t("batchExpires", { batch: l.batchNo })} <span className="tabular-nums">{l.expiryDate}</span>
                  {showSystem ? <span> · {t("systemSays")} <span className="font-medium tabular-nums">{l.systemQty}</span></span> : null}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">{t("countedFor", { item: l.itemName, batch: l.batchNo })}</span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={t("count")}
                  className="h-12 w-28 text-center text-lg tabular-nums"
                  value={values[l.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [l.id]: e.target.value })}
                />
                <span className="text-neutral-500">{l.unit}</span>
              </label>
            </div>
          </li>
        ))}
        {shown.length === 0 ? <li className="py-6 text-center text-sm text-neutral-500">{t("noMatch")}</li> : null}
      </ul>

      <FormError message={error} />
      {info ? <p role="status" className="text-sm text-green-800">{info}</p> : null}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t bg-white px-4 py-3">
        <Button variant="outline" disabled={busy || dirty.length === 0} onClick={() => void onSave()}>{busy ? t("working") : `${t("save")}${dirty.length ? ` (${dirty.length})` : ""}`}</Button>
        <Button disabled={busy || counted === 0} onClick={() => void onSubmit()}>{t("submit")}</Button>
      </div>
    </div>
  );
}
