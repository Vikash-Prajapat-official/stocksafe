"use client";

import { useState } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";
import { ItemPicker, itemLabel, type PickedItem } from "@/components/item-picker";
import { parseGs1 } from "@/lib/gs1";
import { formatPaise, lineValuePaise, parseRupees } from "@/lib/money";

type Opt = { id: string; name: string };
type Line = { key: number; item: PickedItem; batchNo: string; expiry: string; qty: string; mrp: string; cost: string };
type Done = { grnId: string; totalPaise: number; warnings: string[]; lines: number };

let nextKey = 1;

function expiryNote(expiry: string, today: string): { text: string; cls: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: "Already expired: cannot be received", cls: "text-red-700" };
  if (days <= 90) return { text: `Short expiry: ${days} days`, cls: "text-amber-700" };
  return null;
}

export function GrnForm({ stores, suppliers, today }: { stores: Opt[]; suppliers: Opt[]; today: string }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addLine = (item: PickedItem, p: Partial<Line> = {}) =>
    setLines((ls) => [...ls, { key: nextKey++, item, batchNo: "", expiry: "", qty: "", mrp: "", cost: "", ...p }]);

  /** Fills fields from a scanned or typed code. A GS1 pack code carries GTIN, expiry and batch. */
  async function handleCode(text: string) {
    const g = parseGs1(text);
    setCamera(false);
    setCode("");
    if (!g.gtin && !g.batchNo && !g.expiry) {
      setScanMsg(`Could not read "${text.slice(0, 40)}" as a medicine barcode.`);
      return;
    }
    let item: PickedItem | undefined;
    if (g.gtin) {
      try {
        const res = await fetch(`/api/items?gtin=${g.gtin}&pageSize=1`);
        item = ((await res.json()) as { items?: PickedItem[] }).items?.[0];
      } catch {
        /* fall through to the "no match" message */
      }
    }
    const fill = { ...(g.batchNo ? { batchNo: g.batchNo } : {}), ...(g.expiry ? { expiry: g.expiry } : {}) };
    const filled = [g.batchNo && "batch", g.expiry && "expiry"].filter(Boolean).join(" and ");
    if (item) {
      const last = lines[lines.length - 1];
      if (last && last.item.id === item.id && !last.batchNo && !last.expiry) patch(last.key, fill);
      else addLine(item, fill);
      setScanMsg(`${itemLabel(item)}: ${filled || "item"} filled from the barcode.`);
    } else if (lines.length > 0 && filled) {
      const last = lines[lines.length - 1]!;
      patch(last.key, fill);
      setScanMsg(`No item has this barcode, so the ${filled} went into the last line (${itemLabel(last.item)}). Check it is the right item.`);
    } else {
      setScanMsg("No item has this barcode. Add the item first, then scan again. (You can save the barcode number on the item.)");
    }
  }

  const total = lines.reduce((s, l) => {
    const q = Number(l.qty);
    const c = parseRupees(l.cost);
    return s + (Number.isInteger(q) && q > 0 && c !== null ? lineValuePaise(q, c) : 0);
  }, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!invoiceNo.trim()) return setError("Enter the invoice number.");
    if (lines.length === 0) return setError("Add at least one item.");
    const payloadLines = [];
    for (const [i, l] of lines.entries()) {
      const n = `Line ${i + 1} (${itemLabel(l.item)})`;
      const qty = Number(l.qty);
      if (!l.batchNo.trim()) return setError(`${n}: enter the batch number.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.expiry)) return setError(`${n}: enter the expiry date.`);
      if (!Number.isInteger(qty) || qty < 1) return setError(`${n}: quantity must be a whole number, 1 or more.`);
      const mrp = parseRupees(l.mrp);
      const cost = parseRupees(l.cost);
      if (mrp === null) return setError(`${n}: enter the MRP in rupees, for example 25.50.`);
      if (cost === null) return setError(`${n}: enter the purchase price in rupees, for example 19.99.`);
      payloadLines.push({ itemId: l.item.id, batchNo: l.batchNo.trim(), expiryDate: l.expiry, quantity: qty, mrpPaise: mrp, costPaise: cost });
    }
    setBusy(true);
    try {
      const res = await fetch("/api/grn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, supplierId, invoiceNo: invoiceNo.trim(), invoiceDate, lines: payloadLines }),
      });
      const data = (await res.json().catch(() => null)) as
        | { grnId?: string; totalPaise?: number; warnings?: string[]; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.grnId) return setError(data?.error?.message ?? "Could not save the receipt. Please try again.");
      setDone({ grnId: data.grnId, totalPaise: data.totalPaise ?? 0, warnings: data.warnings ?? [], lines: payloadLines.length });
      setLines([]);
      setInvoiceNo("");
      setScanMsg(null);
    } catch {
      setError("Could not reach the server. Nothing was saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {done ? (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Received {done.lines} line(s), total <span className="tabular-nums font-medium">{formatPaise(done.totalPaise)}</span>. Receipt {done.grnId.slice(-8)}.
          {done.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-800">{w}</p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Receive into" htmlFor="storeId">
          <Select id="storeId" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier" htmlFor="supplierId">
          <Select id="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Invoice number" htmlFor="invoiceNo">
          <Input id="invoiceNo" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
        </Field>
        <Field label="Invoice date" htmlFor="invoiceDate">
          <Input id="invoiceDate" type="date" value={invoiceDate} max={today} onChange={(e) => setInvoiceDate(e.target.value)} required />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <ItemPicker onPick={(item) => addLine(item)} />
        <div className="max-w-xs">
          <label htmlFor="scan" className="mb-1 block text-sm font-medium">Scan or type a barcode</label>
          <div className="flex gap-2">
            <Input
              id="scan"
              value={code}
              placeholder="USB scanner types here"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (code.trim()) void handleCode(code.trim());
                }
              }}
            />
            <Button variant="outline" onClick={() => setCamera((c) => !c)}>
              {camera ? "Stop" : "Camera"}
            </Button>
          </div>
        </div>
      </div>
      {camera ? <BarcodeScanner onCode={(t) => void handleCode(t)} onClose={() => setCamera(false)} /> : null}
      {scanMsg ? <p role="status" className="text-sm text-neutral-700">{scanMsg}</p> : null}

      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Item</th>
                <th scope="col" className="px-3 py-2 font-medium">Batch no.</th>
                <th scope="col" className="px-3 py-2 font-medium">Expiry</th>
                <th scope="col" className="px-3 py-2 font-medium">Quantity</th>
                <th scope="col" className="px-3 py-2 font-medium">MRP (₹)</th>
                <th scope="col" className="px-3 py-2 font-medium">Cost (₹)</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              {lines.map((l) => {
                const note = expiryNote(l.expiry, today);
                return (
                  <tr key={l.key}>
                    <td className="px-3 py-2">
                      {itemLabel(l.item)}
                      <div className="text-xs text-neutral-500">{l.item.unit}{l.item.storage === "COLD" ? " · keep at 2–8 °C" : ""}</div>
                    </td>
                    <td className="px-3 py-2"><Input aria-label={`Batch number for ${l.item.name}`} value={l.batchNo} onChange={(e) => patch(l.key, { batchNo: e.target.value })} className="w-32" /></td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Expiry date for ${l.item.name}`} type="date" value={l.expiry} onChange={(e) => patch(l.key, { expiry: e.target.value })} className="w-40" />
                      {note ? <div className={`mt-1 text-xs ${note.cls}`}>{note.text}</div> : null}
                    </td>
                    <td className="px-3 py-2"><Input aria-label={`Quantity for ${l.item.name}`} inputMode="numeric" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} className="w-24 tabular-nums" /></td>
                    <td className="px-3 py-2"><Input aria-label={`MRP for ${l.item.name}`} inputMode="decimal" value={l.mrp} onChange={(e) => patch(l.key, { mrp: e.target.value })} className="w-24 tabular-nums" /></td>
                    <td className="px-3 py-2"><Input aria-label={`Purchase price for ${l.item.name}`} inputMode="decimal" value={l.cost} onChange={(e) => patch(l.key, { cost: e.target.value })} className="w-24 tabular-nums" /></td>
                    <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</Button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 font-medium">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">Invoice total (at cost)</td>
                <td className="px-3 py-2 tabular-nums">{formatPaise(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Search for an item or scan a pack to start the receipt.</p>
      )}

      <FormError message={error} />
      <Button type="submit" disabled={busy || lines.length === 0}>
        {busy ? "Saving..." : "Receive stock"}
      </Button>
    </form>
  );
}
