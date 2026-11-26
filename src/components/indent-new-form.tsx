"use client";

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
  const [fromStoreId, setFromStoreId] = useState(wards[0]?.id ?? "");
  const choices = suppliers.filter((s) => s.id !== fromStoreId);
  const [toStoreId, setToStoreId] = useState((suppliers.find((s) => s.type === "MAIN") ?? choices[0])?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(submit: boolean) {
    setError(null);
    if (lines.length === 0) return setError("Add at least one item.");
    for (const l of lines) {
      const q = Number(l.qty);
      if (!Number.isInteger(q) || q < 1) return setError(`${itemLabel(l.item)}: quantity must be a whole number, 1 or more.`);
    }
    if (!toStoreId || toStoreId === fromStoreId) return setError("Choose the store that will supply the stock.");
    setBusy(true);
    try {
      const res = await fetch("/api/indents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromStoreId, toStoreId, note: note.trim() || undefined, submit, lines: lines.map((l) => ({ itemId: l.item.id, quantity: Number(l.qty) })) }),
      });
      const data = (await res.json().catch(() => null)) as { indent?: { id: string }; error?: { message?: string } } | null;
      if (!res.ok || !data?.indent) return setError(data?.error?.message ?? "Could not save the indent. Nothing was sent.");
      router.push(`/indents/${data.indent.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was sent. Please try again.");
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
        <Field label="Ward (who needs it)" htmlFor="ward">
          <Select id="ward" value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)}>
            {wards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Ask this store" htmlFor="supplier">
          <Select id="supplier" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
            <option value="">Choose a store</option>
            {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)" htmlFor="note">
          <Input id="note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="For example: urgent, night shift" />
        </Field>
      </div>

      <ItemPicker
        onPick={(item) => {
          if (lines.some((l) => l.item.id === item.id)) return;
          setLines([...lines, { item, qty: "" }]);
        }}
      />

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-500">Search for the medicines and supplies the ward needs.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{itemLabel(l.item)}</div>
                <div className="text-xs text-neutral-500">Counted in {l.item.unit}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Quantity
                <Input aria-label={`Quantity of ${l.item.name}`} inputMode="numeric" className="w-24 tabular-nums" value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.item.id === l.item.id ? { ...x, qty: e.target.value } : x)))} />
              </label>
              <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((x) => x.item.id !== l.item.id))}>Remove</Button>
            </li>
          ))}
        </ul>
      )}

      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || lines.length === 0}>{busy ? "Sending..." : "Send to store"}</Button>
        <Button variant="outline" disabled={busy || lines.length === 0} onClick={() => void save(false)}>Save as draft</Button>
      </div>
    </form>
  );
}
