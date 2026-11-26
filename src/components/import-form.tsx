"use client";

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
        setError(data?.error?.message ?? "The import failed. Please try again.");
        return;
      }
      setResult(data);
      if (!dryRun && data.created > 0) router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="file" className="block text-sm font-medium">
          CSV or Excel file
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
            Check file
          </Button>
          <Button disabled={!file || busy} onClick={() => run(false)}>
            {busy ? "Working..." : "Import"}
          </Button>
        </div>
      </div>

      <FormError message={error} />

      {result ? (
        <div className="space-y-3" aria-live="polite">
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 tabular-nums">
            {result.dryRun
              ? `Check only: ${result.wouldCreate} of ${result.totalRows} rows are ready to import.`
              : `Imported ${result.created} item(s) from ${result.totalRows} rows.`}{" "}
            {result.skippedBlank ? `${result.skippedBlank} blank row(s) skipped. ` : ""}
            {result.errors.length ? `${result.errors.length} problem(s) below were not imported.` : ""}
          </p>
          {result.warnings.map((w) => (
            <p key={w} className="text-sm text-neutral-600">
              Note: {w}
            </p>
          ))}
          {result.errors.length ? (
            <div className="max-h-96 overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-neutral-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Row</th>
                    <th scope="col" className="px-3 py-2 font-medium">Column</th>
                    <th scope="col" className="px-3 py-2 font-medium">Problem</th>
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
