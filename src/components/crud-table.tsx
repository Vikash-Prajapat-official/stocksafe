"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/fields";

type Option = { value: string; label: string };
export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "select" | "checkbox" | "password" | "multiselect";
  options?: Option[];
  hint?: string;
  placeholder?: string;
  /** Password fields: required when adding, optional (blank = unchanged) when editing. */
};
export type ColumnDef = {
  key: string;
  label: string;
  kind?: "text" | "bool" | "option" | "multi";
  options?: Option[];
};
type Row = { id: string } & Record<string, unknown>;

type Props = {
  /** Words for this table, already in the language of the user: the add button, the two form titles, and the empty message. */
  labels: { add: string; addTitle: string; editTitle: string; none: string };
  /** e.g. "/api/admin/stores". Add = POST here; edit = PATCH here/{id}. */
  endpoint: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  rows: Row[];
};

function initialValues(fields: FieldDef[], row?: Row): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "password") v[f.key] = "";
    else if (f.type === "checkbox") v[f.key] = row ? Boolean(row[f.key]) : f.key === "active";
    else if (f.type === "multiselect") v[f.key] = row ? ((row[f.key] as string[]) ?? []) : [];
    else if (f.type === "select") v[f.key] = row ? String(row[f.key] ?? "") : (f.options?.[0]?.value ?? "");
    else v[f.key] = row ? String(row[f.key] ?? "") : "";
  }
  return v;
}

function cell(row: Row, col: ColumnDef, yes: string, no: string, none: string) {
  const value = row[col.key];
  if (col.kind === "bool") return value ? yes : no;
  if (col.kind === "option") return col.options?.find((o) => o.value === value)?.label ?? String(value ?? "");
  if (col.kind === "multi") {
    const ids = (value as string[]) ?? [];
    return ids.map((id) => col.options?.find((o) => o.value === id)?.label ?? id).join(", ") || none;
  }
  return String(value ?? "");
}

export function CrudTable({ labels, endpoint, fields, columns, rows }: Props) {
  const router = useRouter();
  const tc = useTranslations("common");
  const t = useTranslations("crud");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(target: Row | "new") {
    setEditing(target);
    setValues(initialValues(fields, target === "new" ? undefined : target));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const isNew = editing === "new";
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === "password" && v === "") continue; // blank on edit = unchanged
      body[f.key] = v;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isNew ? endpoint : `${endpoint}/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? t("saveFailed"));
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError(tc("offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => open("new")}>{labels.add}</Button>
      </div>

      {editing ? (
        <form onSubmit={submit} className="space-y-4 rounded-lg border bg-neutral-50 p-4">
          <h2 className="font-medium">{editing === "new" ? labels.addTitle : labels.editTitle}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `f-${f.key}`;
              const isNew = editing === "new";
              if (f.type === "checkbox")
                return (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.key])}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                    />
                    {f.label}
                  </label>
                );
              if (f.type === "multiselect")
                return (
                  <fieldset key={f.key} className="space-y-1 sm:col-span-2">
                    <legend className="text-sm font-medium">{f.label}</legend>
                    <div className="flex flex-wrap gap-4">
                      {f.options?.map((o) => {
                        const list = (values[f.key] as string[]) ?? [];
                        return (
                          <label key={o.value} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={list.includes(o.value)}
                              onChange={(e) =>
                                setValues({
                                  ...values,
                                  [f.key]: e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value),
                                })
                              }
                            />
                            {o.label}
                          </label>
                        );
                      })}
                    </div>
                    {f.hint ? <p className="text-xs text-neutral-500">{f.hint}</p> : null}
                  </fieldset>
                );
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  htmlFor={id}
                  hint={f.type === "password" && !isNew ? t("keepPassword") : f.hint}
                >
                  {f.type === "select" ? (
                    <Select
                      id={id}
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      type={f.type === "password" ? "password" : "text"}
                      autoComplete={f.type === "password" ? "new-password" : "off"}
                      required={f.type === "password" ? isNew : f.key === "name"}
                      placeholder={f.placeholder}
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? tc("saving") : tc("save")}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              {tc("cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-4 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="px-4 py-2">
                <span className="sr-only">{tc("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-neutral-500">
                  {labels.none}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={row.active === false ? "text-neutral-400" : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2">
                      {cell(row, c, tc("yes"), tc("no"), tc("none"))}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => open(row)}>
                      {tc("edit")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
