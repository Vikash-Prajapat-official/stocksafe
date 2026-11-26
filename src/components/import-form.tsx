"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/fields";

type Result = {
  dryRun: boolean;
  created: number;
  wouldCreate: number;
  errors: { row: number; field?: string; message: string }[];
  warnings: string[];
  skippedBlank: number;
  totalRows: number;
};

export function ImportForm() {
  const router = useRouter();
  const t = useTranslations("importForm");
  const tc = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/items/import${dryRun ? "?dryRun=true" : ""}`, { method: "POST", body });
      const data = (await res.json().catch(() => null)) as (Result & { error?: { message?: string } }) | null;
      if (!res.ok || !data) {
        setError(data?.error?.message ?? t("failed"));
        return;
      }
      setResult(data);
      if (!dryRun && data.created > 0) router.refresh();
    } catch {
      setError(tc("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="file" className="block text-sm font-medium">
          {t("file")}
        </label>
        <Input
          id="file"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />
        <div className="flex gap-2">
          <Button variant="outline" disabled={!file || busy} onClick={() => run(true)}>
            {t("check")}
          </Button>
          <Button disabled={!file || busy} onClick={() => run(false)}>
            {busy ? tc("working") : t("import")}
          </Button>
        </div>
      </div>

      <FormError message={error} />

      {result ? (
        <div className="space-y-3" aria-live="polite">
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 tabular-nums">
            {result.dryRun
              ? t("checked", { ready: result.wouldCreate, total: result.totalRows })
              : t("imported", { created: result.created, total: result.totalRows })}{" "}
            {result.skippedBlank ? t("blankSkipped", { count: result.skippedBlank }) + " " : ""}
            {result.errors.length ? t("problems", { count: result.errors.length }) : ""}
          </p>
          {result.warnings.map((w) => (
            <p key={w} className="text-sm text-neutral-600">
              {t("note", { text: w })}
            </p>
          ))}
          {result.errors.length ? (
            <div className="max-h-96 overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-neutral-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t("row")}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t("column")}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t("problem")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 tabular-nums">{e.row}</td>
                      <td className="px-3 py-2">{e.field ?? ""}</td>
                      <td className="px-3 py-2">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
