"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";
import { ItemPicker, itemLabel, type PickedItem } from "@/components/item-picker";

type StoreOpt = { id: string; name: string; type: string };
type Line = { item: PickedItem; qty: string };

/** A ward nurse asks the store for stock. */
export function IndentNewForm({ wards, suppliers }: { wards: StoreOpt[]; suppliers: StoreOpt[] }) {
  const router = useRouter();
  const t = useTranslations("indentNew");
  const tc = useTranslations("common");
  const tl = useTranslations("lines");
  const [fromStoreId, setFromStoreId] = useState(wards[0]?.id ?? "");
  const choices = suppliers.filter((s) => s.id !== fromStoreId);
  const [toStoreId, setToStoreId] = useState((suppliers.find((s) => s.type === "MAIN") ?? choices[0])?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(submit: boolean) {
    setError(null);
    if (lines.length === 0) return setError(tl("needItem"));
    for (const l of lines) {
      const q = Number(l.qty);
      if (!Number.isInteger(q) || q < 1) return setError(tl("qtyWhole", { item: itemLabel(l.item) }));
    }
    if (!toStoreId || toStoreId === fromStoreId) return setError(t("needStore"));
    setBusy(true);
    try {
      const res = await fetch("/api/indents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromStoreId, toStoreId, note: note.trim() || undefined, submit, lines: lines.map((l) => ({ itemId: l.item.id, quantity: Number(l.qty) })) }),
      });
      const data = (await res.json().catch(() => null)) as { indent?: { id: string }; error?: { message?: string } } | null;
      if (!res.ok || !data?.indent) return setError(data?.error?.message ?? t("failed"));
      router.push(`/indents/${data.indent.id}`);
      router.refresh();
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("ward")} htmlFor="ward">
          <Select id="ward" value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)}>
            {wards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("askStore")} htmlFor="supplier">
          <Select id="supplier" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
            <option value="">{t("chooseStore")}</option>
            {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={`${tc("note")} (${tc("optional")})`} htmlFor="note">
          <Input id="note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        </Field>
      </div>

      <ItemPicker
        onPick={(item) => {
          if (lines.some((l) => l.item.id === item.id)) return;
          setLines([...lines, { item, qty: "" }]);
        }}
      />

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("search")}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{itemLabel(l.item)}</div>
                <div className="text-xs text-neutral-500">{tl("countedIn", { unit: l.item.unit })}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                {tc("quantity")}
                <Input aria-label={tl("quantityOf", { item: l.item.name })} inputMode="numeric" className="w-24 tabular-nums" value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.item.id === l.item.id ? { ...x, qty: e.target.value } : x)))} />
              </label>
              <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((x) => x.item.id !== l.item.id))}>{tc("remove")}</Button>
            </li>
          ))}
        </ul>
      )}

      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || lines.length === 0}>{busy ? t("sending") : t("send")}</Button>
        <Button variant="outline" disabled={busy || lines.length === 0} onClick={() => void save(false)}>{t("draft")}</Button>
      </div>
    </form>
  );
}
