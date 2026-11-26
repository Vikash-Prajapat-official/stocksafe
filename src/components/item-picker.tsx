"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/fields";

export type PickedItem = {
  id: string;
  name: string;
  strength: string | null;
  form: string;
  unit: string;
  storage: string;
};

export const itemLabel = (i: Pick<PickedItem, "name" | "strength">) => (i.strength ? `${i.name} ${i.strength}` : i.name);

/** Type-ahead search over active items. Calls onPick with the chosen item and clears itself. */
export function ItemPicker({
  onPick,
  id = "item-picker",
  label,
}: {
  onPick: (item: PickedItem) => void;
  id?: string;
  label?: string;
}) {
  const t = useTranslations("picker");
  const tf = useTranslations("forms");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(term)}&pageSize=8&active=true`);
        const data = (await res.json()) as { items?: PickedItem[] };
        if (mine === seq.current) setResults(data.items ?? []);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative max-w-md">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label ?? t("add")}
      </label>
      <Input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        autoComplete="off"
      />
      {q.trim().length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg" role="listbox" aria-label={t("matching")}>
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-neutral-500">{busy ? t("searching") : t("noMatch")}</li>
          ) : (
            results.map((i) => (
              <li key={i.id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-green-50"
                  onClick={() => {
                    onPick(i);
                    setQ("");
                    setResults([]);
                  }}
                >
                  <span>{itemLabel(i)}</span>
                  <span className="text-xs text-neutral-500">
                    {tf.has(i.form) ? tf(i.form) : i.form}
                    {i.storage === "COLD" ? " · 2–8 °C" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
