"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/fields";

type Line = { id: string; name: string; unit: string; requested: number; approved: number | null; issued: number; available: number | null };

async function post(url: string, fallback: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string }; status?: string } | null;
  return { ok: res.ok, message: data?.error?.message ?? fallback, data };
}

/**
 * Buttons for an indent, shown only to someone who may use them:
 * the ward's nurse sends a draft; the store's keeper approves (fully or partly), rejects, issues, or closes a part-issued indent.
 */
export function IndentActions({
  id,
  status,
  role,
  canAct,
  lines,
}: {
  id: string;
  status: string;
  role: string;
  canAct: boolean;
  lines: Line[];
}) {
  const router = useRouter();
  const t = useTranslations("indentActions");
  const tc = useTranslations("common");
  const [approved, setApproved] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, String(l.requested)])));
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canAct) return null;

  async function run(url: string, body?: unknown, done?: (data: Record<string, unknown> | null) => string | null) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await post(url, t("failed"), body);
      if (!r.ok) return setError(r.message);
      setInfo(done ? done(r.data as Record<string, unknown> | null) : null);
      setRejecting(false);
      setClosing(false);
      router.refresh();
    } catch {
      setError(t("offline"));
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    const approvals = [];
    for (const l of lines) {
      const q = Number(approved[l.id]);
      if (!Number.isInteger(q) || q < 0 || q > l.requested) return setError(t("approveRange", { item: l.name, max: l.requested }));
      approvals.push({ lineId: l.id, qtyApproved: q });
    }
    void run(`/api/indents/${id}/approve`, { approvals, note: note.trim() || undefined });
  }

  return (
    <section aria-label={tc("actions")} className="space-y-4 rounded-lg border bg-neutral-50 p-4">
      {role === "NURSE" && status === "DRAFT" ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-700">{t("draftNote")}</p>
          <Button disabled={busy} onClick={() => void run(`/api/indents/${id}/submit`)}>{t("send")}</Button>
        </div>
      ) : null}

      {role === "STOREKEEPER" && status === "SUBMITTED" ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">{t("approveHelp")}</p>
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{tc("item")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("requested")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("inStock")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("approveCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.requested}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.available ?? "?"}</td>
                    <td className="px-3 py-2 text-right">
                      <Input aria-label={t("approvedOf", { item: l.name })} inputMode="numeric" className="ml-auto w-24 text-right tabular-nums" value={approved[l.id] ?? ""} onChange={(e) => setApproved({ ...approved, [l.id]: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block max-w-md text-sm">
            <span className="mb-1 block font-medium">{rejecting ? t("rejectReason") : t("wardNoteLabel")}</span>
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={approve}>{tc("approve")}</Button>
            {rejecting ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => (note.trim() ? void run(`/api/indents/${id}/reject`, { note: note.trim() }) : setError(t("needRejectReason")))}
              >
                {t("confirmReject")}
              </Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>{tc("reject")}</Button>
            )}
          </div>
        </div>
      ) : null}

      {role === "STOREKEEPER" && (status === "APPROVED" || status === "PARTIAL") ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">
            {t("issueHelp")}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                void run(`/api/indents/${id}/issue`, undefined, (d) => (d?.status === "ISSUED" ? t("issuedFull") : t("issuedPart")))
              }
            >
              {busy ? t("issuing") : t("issueNow")}
            </Button>
            {status === "PARTIAL" ? (
              closing ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">{t("closeReason")}</span>
                    <Input className="w-72" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button variant="danger" disabled={busy} onClick={() => void run(`/api/indents/${id}/close`, { note: note.trim() || undefined })}>{t("confirmClose")}</Button>
                </>
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => setClosing(true)}>{t("closeShort")}</Button>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      <FormError message={error} />
      {info ? <p role="status" className="text-sm text-green-800">{info}</p> : null}
    </section>
  );
}
