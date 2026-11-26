"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { LinesEditor, checkLines, toApiLines, type Line, type PlannedLine } from "@/components/issue-form";

type Opt = { id: string; name: string };
type SlipPick = { itemId: string; batchNo: string; expiryDate: string; quantity: number };
type Slip = {
  when: string;
  store: string;
  patient: string;
  by: string;
  rows: { name: string; unit: string; batchNo: string; expiryDate: string; quantity: number }[];
};

export function DispenseForm({
  stores,
  hospitalName,
  userName,
  retentionDays,
}: {
  stores: Opt[];
  hospitalName: string;
  userName: string;
  retentionDays: number;
}) {
  const t = useTranslations("dispense");
  const tl = useTranslations("lines");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [patient, setPatient] = useState("");
  const [lines, setLinesState] = useState<Line[]>([]);
  const [planned, setPlanned] = useState<PlannedLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState<Slip | null>(null);

  const setLines = (ls: Line[]) => {
    setLinesState(ls);
    setPlanned(null);
  };
  const reviewed = planned !== null && planned.every((p) => !p.shortage);

  async function call(preview: boolean) {
    setError(null);
    setSlip(null);
    const problem = checkLines(lines, tl as never);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const res = await fetch("/api/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, patientLabel: patient.trim() || null, preview, lines: toApiLines(lines) }),
      });
      const data = (await res.json().catch(() => null)) as { lines?: PlannedLine[]; picks?: SlipPick[]; error?: { message?: string } } | null;
      if (!res.ok || !data) return setError(data?.error?.message ?? t("failed"));
      if (preview) return setPlanned(data.lines ?? []);
      const byId = new Map(lines.map((l) => [l.item.id, l.item]));
      setSlip({
        when: dateTimeFormat(intlTag(locale)).format(new Date()),
        store: stores.find((s) => s.id === storeId)?.name ?? "",
        patient: patient.trim(),
        by: userName,
        rows: (data.picks ?? []).map((p) => {
          const it = byId.get(p.itemId);
          return { name: it ? (it.strength ? `${it.name} ${it.strength}` : it.name) : "", unit: it?.unit ?? "", batchNo: p.batchNo, expiryDate: p.expiryDate, quantity: p.quantity };
        }),
      });
      setLinesState([]);
      setPlanned(null);
      setPatient("");
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* The slip is the only thing printed (everything else has print:hidden). */}
      {slip ? (
        <section aria-label={t("slip")} className="max-w-md rounded-lg border p-4 print:max-w-none print:border-0 print:p-0">
          <h2 className="text-lg font-semibold">{hospitalName}</h2>
          <p className="text-sm text-neutral-600">{t("slip")} · {slip.store}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-600">{tc("date")}</dt>
            <dd className="tabular-nums">{slip.when}</dd>
            <dt className="text-neutral-600">{t("patientToken")}</dt>
            <dd>{slip.patient || t("notRecorded")}</dd>
            <dt className="text-neutral-600">{t("dispensedBy")}</dt>
            <dd>{slip.by}</dd>
          </dl>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b text-neutral-600">
                <th scope="col" className="py-1 font-medium">{t("medicine")}</th>
                <th scope="col" className="py-1 font-medium">{tc("batch")}</th>
                <th scope="col" className="py-1 font-medium">{tc("expiry")}</th>
                <th scope="col" className="py-1 text-right font-medium">{t("qty")}</th>
              </tr>
            </thead>
            <tbody>
              {slip.rows.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1">{r.name}</td>
                  <td className="py-1">{r.batchNo}</td>
                  <td className="py-1 tabular-nums">{r.expiryDate}</td>
                  <td className="py-1 text-right tabular-nums">{r.quantity} {r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-2 print:hidden">
            <Button onClick={() => window.print()}>{t("printSlip")}</Button>
            <Button variant="outline" onClick={() => setSlip(null)}>{t("done")}</Button>
          </div>
        </section>
      ) : null}

      <form
        className="space-y-5 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          void call(!reviewed);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("from")} htmlFor="store">
            <Select id="store" value={storeId} onChange={(e) => { setStoreId(e.target.value); setLinesState(lines.map((l) => ({ ...l, batches: undefined, batchId: "" }))); setPlanned(null); }}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("patientLabel")}
            htmlFor="patient"
            hint={t("privacy", { days: retentionDays })}
          >
            <Input id="patient" value={patient} maxLength={100} onChange={(e) => setPatient(e.target.value)} autoComplete="off" />
          </Field>
        </div>

        <LinesEditor storeId={storeId} lines={lines} onChange={setLines} planned={planned} />

        <FormError message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || lines.length === 0}>
            {busy ? tc("working") : reviewed ? t("confirm") : t("review")}
          </Button>
          {planned && !reviewed ? <span className="text-sm text-red-700">{tl("fixShortage")}</span> : null}
          {reviewed ? <span className="text-sm text-neutral-600">{tl("checkBatches")}</span> : null}
        </div>
      </form>
    </div>
  );
}
