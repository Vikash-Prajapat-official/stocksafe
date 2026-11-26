"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/fields";

type Line = { id: string; name: string; unit: string; requested: number; approved: number | null; issued: number; available: number | null };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string }; status?: string } | null;
  return { ok: res.ok, message: data?.error?.message ?? "Something went wrong. Nothing was changed.", data };
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
      const r = await post(url, body);
      if (!r.ok) return setError(r.message);
      setInfo(done ? done(r.data as Record<string, unknown> | null) : null);
      setRejecting(false);
      setClosing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    const approvals = [];
    for (const l of lines) {
      const q = Number(approved[l.id]);
      if (!Number.isInteger(q) || q < 0 || q > l.requested) return setError(`${l.name}: approve a whole number from 0 to ${l.requested}.`);
      approvals.push({ lineId: l.id, qtyApproved: q });
    }
    void run(`/api/indents/${id}/approve`, { approvals, note: note.trim() || undefined });
  }

  return (
    <section aria-label="Actions" className="space-y-4 rounded-lg border bg-neutral-50 p-4">
      {role === "NURSE" && status === "DRAFT" ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-700">This indent is a draft. The store cannot see it until you send it.</p>
          <Button disabled={busy} onClick={() => void run(`/api/indents/${id}/submit`)}>Send to store</Button>
        </div>
      ) : null}

      {role === "STOREKEEPER" && status === "SUBMITTED" ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">Approve what you can give. Lower a quantity to approve less, or set it to 0 to skip an item.</p>
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Item</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Requested</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">In stock now</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Approve</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.requested}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.available ?? "?"}</td>
                    <td className="px-3 py-2 text-right">
                      <Input aria-label={`Approved quantity of ${l.name}`} inputMode="numeric" className="ml-auto w-24 text-right tabular-nums" value={approved[l.id] ?? ""} onChange={(e) => setApproved({ ...approved, [l.id]: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block max-w-md text-sm">
            <span className="mb-1 block font-medium">{rejecting ? "Reason for rejecting (required)" : "Note to the ward (optional)"}</span>
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={approve}>Approve</Button>
            {rejecting ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => (note.trim() ? void run(`/api/indents/${id}/reject`, { note: note.trim() }) : setError("Enter the reason for rejecting."))}
              >
                Confirm reject
              </Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
            )}
          </div>
        </div>
      ) : null}

      {role === "STOREKEEPER" && (status === "APPROVED" || status === "PARTIAL") ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">
            Issuing moves the approved stock from your store to the ward, earliest expiry first. If some of it is not in stock, what exists is issued and the rest stays outstanding.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                void run(`/api/indents/${id}/issue`, undefined, (d) => (d?.status === "ISSUED" ? "Issued in full." : "Issued what was in stock. The rest is still outstanding."))
              }
            >
              {busy ? "Issuing..." : "Issue now"}
            </Button>
            {status === "PARTIAL" ? (
              closing ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Why nothing more will be sent (optional)</span>
                    <Input className="w-72" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button variant="danger" disabled={busy} onClick={() => void run(`/api/indents/${id}/close`, { note: note.trim() || undefined })}>Confirm close</Button>
                </>
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => setClosing(true)}>Close without issuing the rest</Button>
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
