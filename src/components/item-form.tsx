"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";
import { DEFAULT_UNIT, ITEM_FORMS, STORAGES, type ItemForm } from "@/lib/schemas/item";

export type ItemFormValues = {
  id?: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: ItemForm;
  unit: string;
  category: string | null;
  isEssential: boolean;
  storage: "ROOM" | "COLD";
  minLevel: number;
  reorderLevel: number;
  maxLevel: number;
  active?: boolean;
};

const EMPTY: ItemFormValues = {
  name: "",
  genericName: "",
  strength: "",
  form: "TABLET",
  unit: "tablet",
  category: "",
  isEssential: false,
  storage: "ROOM",
  minLevel: 0,
  reorderLevel: 0,
  maxLevel: 0,
};

export function ItemFormView({ initial }: { initial?: ItemFormValues }) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [v, setV] = useState<ItemFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ItemFormValues>(k: K, val: ItemFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const num = (k: "minLevel" | "reorderLevel" | "maxLevel") => (
    <Input
      id={k}
      type="number"
      min={0}
      step={1}
      className="tabular-nums"
      value={v[k]}
      onChange={(e) => set(k, e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id, ...body } = v;
      const res = await fetch(editing ? `/api/items/${id}` : "/api/items", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Could not save. Please try again.");
        return;
      }
      router.push("/items");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <Input id="name" required value={v.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Generic name" htmlFor="genericName">
          <Input id="genericName" value={v.genericName ?? ""} onChange={(e) => set("genericName", e.target.value)} />
        </Field>
        <Field label="Strength" htmlFor="strength" hint="For example 500 mg or 5 mg/ml">
          <Input id="strength" value={v.strength ?? ""} onChange={(e) => set("strength", e.target.value)} />
        </Field>
        <Field label="Form" htmlFor="form">
          <Select
            id="form"
            value={v.form}
            onChange={(e) => {
              const form = e.target.value as ItemForm;
              // Keep the unit in step with the form unless the user chose a custom one.
              const unitWasDefault = v.unit === "" || v.unit === DEFAULT_UNIT[v.form];
              setV((p) => ({ ...p, form, unit: unitWasDefault ? DEFAULT_UNIT[form] : p.unit }));
            }}
          >
            {ITEM_FORMS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" htmlFor="unit" hint="What you count in the store: tablet, vial, bottle, tube, piece">
          <Input id="unit" required value={v.unit} onChange={(e) => set("unit", e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="category">
          <Input id="category" value={v.category ?? ""} onChange={(e) => set("category", e.target.value)} />
        </Field>
        <Field label="Storage" htmlFor="storage">
          <Select id="storage" value={v.storage} onChange={(e) => set("storage", e.target.value as "ROOM" | "COLD")}>
            {STORAGES.map((s) => (
              <option key={s} value={s}>
                {s === "COLD" ? "Cold chain (2 to 8 °C)" : "Room temperature"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.isEssential} onChange={(e) => set("isEssential", e.target.checked)} />
            Essential medicine (NLEM)
          </label>
          {editing ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.active ?? true} onChange={(e) => set("active", e.target.checked)} />
              Active
            </label>
          ) : null}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Stock levels</legend>
        <p className="text-xs text-neutral-500">
          Counted in the unit above. Use 0 for &quot;not set&quot;. Minimum ≤ reorder ≤ maximum.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum" htmlFor="minLevel">
            {num("minLevel")}
          </Field>
          <Field label="Reorder level" htmlFor="reorderLevel">
            {num("reorderLevel")}
          </Field>
          <Field label="Maximum" htmlFor="maxLevel">
            {num("maxLevel")}
          </Field>
        </div>
      </fieldset>

      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : editing ? "Save changes" : "Add item"}
        </Button>
        <ButtonLink href="/items" variant="outline">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
