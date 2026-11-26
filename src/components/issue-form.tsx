"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";
import { ItemPicker, itemLabel, type PickedItem } from "@/components/item-picker";
import type { StockRowView } from "@/lib/ledger";

type Opt = { id: string; name: string };

// ---------- shared by Issue/Transfer and Dispense ----------

export type Line = {
  key: number;
  item: PickedItem;
  quantity: string;
  manual: boolean;
  batchId: string;
  overrideReason: string;
  batches?: StockRowView[];
};
export type PlannedLine = {
  itemId: string;
  quantity: number;
  picks: { batchNo: string; expiryDate: string; quantity: number }[];
  shortage?: { requested: number; available: number; expired: number };
};
type Tr = (key: string, values?: Record<string, string | number>) => string;

let nextKey = 1;
export const newLine = (item: PickedItem): Line => ({ key: nextKey++, item, quantity: "", manual: false, batchId: "", overrideReason: "" });

/** Lines for the request body. A manual batch choice sends the batch and its reason. */
export function toApiLines(lines: Line[]) {
  return lines.map((l) => ({
    itemId: l.item.id,
    quantity: Number(l.quantity),
    ...(l.manual && l.batchId ? { batchId: l.batchId, overrideReason: l.overrideReason } : {}),
  }));
}

export function checkLines(lines: Line[], t: Tr): string | null {
  if (lines.length === 0) return t("needItem");
  for (const l of lines) {
    const q = Number(l.quantity);
    if (!Number.isInteger(q) || q < 1) return t("qtyWhole", { item: itemLabel(l.item) });
    if (l.manual && !l.batchId) return t("needBatchChoice", { item: itemLabel(l.item) });
    if (l.manual && l.overrideReason.trim().length < 3) return t("needOverrideReason", { item: itemLabel(l.item) });
  }
  return null;
}

export function LinesEditor({
  storeId,
  lines,
  onChange,
  planned,
}: {
  storeId: string;
  lines: Line[];
  onChange: (lines: Line[]) => void;
  planned: PlannedLine[] | null;
}) {
  const t = useTranslations("lines");
  const tc = useTranslations("common");
  const patch = (key: number, p: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));

  async function toggleManual(l: Line, on: boolean) {
    if (!on) return patch(l.key, { manual: false, batchId: "", overrideReason: "" });
    patch(l.key, { manual: true });
    try {
      const res = await fetch(`/api/stock?itemId=${l.item.id}&storeId=${storeId}`);
      const data = (await res.json()) as { rows?: StockRowView[] };
      patch(l.key, { manual: true, batches: (data.rows ?? []).filter((r) => !r.expired) });
    } catch {
      patch(l.key, { manual: true, batches: [] });
    }
  }

  return (
    <div className="space-y-3">
      <ItemPicker
        onPick={(item) => {
          if (lines.some((l) => l.item.id === item.id)) return; // one line per item; change its quantity instead
          onChange([...lines, newLine(item)]);
        }}
      />
      {lines.length === 0 ? <p className="text-sm text-neutral-500">{t("search")}</p> : null}
      <ul className="space-y-3">
        {lines.map((l) => {
          const plan = planned?.find((p) => p.itemId === l.item.id);
          return (
            <li key={l.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{itemLabel(l.item)}</div>
                  <div className="text-xs text-neutral-500">{t("countedIn", { unit: l.item.unit })}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  {tc("quantity")}
                  <Input aria-label={t("quantityOf", { item: l.item.name })} inputMode="numeric" className="w-24 tabular-nums" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={l.manual} onChange={(e) => void toggleManual(l, e.target.checked)} />
                  {t("chooseBatch")}
                </label>
                <Button size="sm" variant="ghost" onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>{tc("remove")}</Button>
              </div>

              {l.manual ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={t("batchOverride")} htmlFor={`batch-${l.key}`}>
                    <Select id={`batch-${l.key}`} value={l.batchId} onChange={(e) => patch(l.key, { batchId: e.target.value })}>
                      <option value="">{t("pickBatch")}</option>
                      {(l.batches ?? []).map((b) => (
                        <option key={b.batchId} value={b.batchId}>
                          {t("batchOption", { batch: b.batchNo, expiry: b.expiryDate, qty: b.quantity })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("overrideReason")} htmlFor={`why-${l.key}`}>
                    <Input id={`why-${l.key}`} value={l.overrideReason} onChange={(e) => patch(l.key, { overrideReason: e.target.value })} />
                  </Field>
                </div>
              ) : null}

              {plan ? (
                plan.shortage ? (
                  <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                    {t("shortage", { available: plan.shortage.available, requested: plan.shortage.requested })}
                    {plan.shortage.expired ? ` ${t("shortageExpired", { count: plan.shortage.expired })}` : ""}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1 rounded bg-green-50 px-3 py-2 text-sm text-green-900">
                    {plan.picks.map((p, i) => (
                      <li key={i} className="tabular-nums">
                        {t("pick", { qty: p.quantity, batch: p.batchNo, expiry: p.expiryDate })}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Issue / Transfer ----------

type Picks = { itemId: string; batchNo: string; expiryDate: string; quantity: number }[];

export function IssueForm({ fromStores, allStores }: { fromStores: Opt[]; allStores: Opt[] }) {
  const t = useTranslations("issue");
  const tl = useTranslations("lines") as unknown as Tr;
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"TRANSFER" | "ISSUE">("TRANSFER");
  const [fromStoreId, setFromStoreId] = useState(fromStores[0]?.id ?? "");
  const [toStoreId, setToStoreId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLinesState] = useState<Line[]>([]);
  const [planned, setPlanned] = useState<PlannedLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ mode: string; picks: Picks } | null>(null);

  // Any change invalidates the reviewed FEFO split, so what is confirmed is always what was shown.
  const setLines = (ls: Line[]) => {
    setLinesState(ls);
    setPlanned(null);
  };
  const destinations = allStores.filter((s) => s.id !== fromStoreId);
  const reviewed = planned !== null && planned.every((p) => !p.shortage);

  async function call(preview: boolean) {
    setError(null);
    setDone(null);
    const problem =
      checkLines(lines, tl) ??
      (mode === "TRANSFER" && !toStoreId ? t("needDestination") : null) ??
      (mode === "ISSUE" && !reason.trim() ? t("needReason") : null);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const res = await fetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          fromStoreId,
          toStoreId: mode === "TRANSFER" ? toStoreId : undefined,
          reason: reason.trim() || undefined,
          preview,
          lines: toApiLines(lines),
        }),
      });
      const data = (await res.json().catch(() => null)) as { lines?: PlannedLine[]; picks?: Picks; error?: { message?: string } } | null;
      if (!res.ok || !data) return setError(data?.error?.message ?? t("failed"));
      if (preview) setPlanned(data.lines ?? []);
      else {
        setDone({ mode, picks: data.picks ?? [] });
        setLinesState([]);
        setPlanned(null);
        setReason("");
      }
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
        void call(!reviewed);
      }}
    >
      {done ? (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {done.mode === "TRANSFER" ? t("transferred") : t("issued")}:
          <ul className="mt-1 list-inside list-disc tabular-nums">
            {done.picks.map((p, i) => (
              <li key={i}>{tl("pick", { qty: p.quantity, batch: p.batchNo, expiry: p.expiryDate })}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="flex gap-6">
        <legend className="mb-1 text-sm font-medium">{t("whatDoing")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === "TRANSFER"} onChange={() => { setMode("TRANSFER"); setPlanned(null); }} />
          {t("modeTransfer")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === "ISSUE"} onChange={() => { setMode("ISSUE"); setPlanned(null); }} />
          {t("modeIssue")}
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("fromStore")} htmlFor="from">
          <Select id="from" value={fromStoreId} onChange={(e) => { setFromStoreId(e.target.value); setLinesState(lines.map((l) => ({ ...l, batches: undefined, batchId: "" }))); setPlanned(null); }}>
            {fromStores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        {mode === "TRANSFER" ? (
          <Field label={t("toStore")} htmlFor="to">
            <Select id="to" value={toStoreId} onChange={(e) => { setToStoreId(e.target.value); setPlanned(null); }}>
              <option value="">{t("chooseStore")}</option>
              {destinations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={mode === "ISSUE" ? tc("reason") : t("noteOptional")} htmlFor="reason">
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "ISSUE" ? t("reasonPlaceholder") : ""} />
        </Field>
      </div>

      <LinesEditor storeId={fromStoreId} lines={lines} onChange={setLines} planned={planned} />

      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || lines.length === 0}>
          {busy ? tc("working") : reviewed ? (mode === "TRANSFER" ? t("confirmTransfer") : t("confirmIssue")) : t("review")}
        </Button>
        {planned && !reviewed ? <span className="text-sm text-red-700">{t("fixShortage")}</span> : null}
        {reviewed ? <span className="text-sm text-neutral-600">{t("checkBatches")}</span> : null}
      </div>
    </form>
  );
}
