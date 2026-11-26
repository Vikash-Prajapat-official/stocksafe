import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  DEFAULT_UNIT,
  ITEM_FORMS,
  itemCreateSchema,
  itemKey,
  levelProblem,
  toItemInput,
  type ItemForm,
  type ItemInput,
  type StorageType,
} from "@/lib/schemas/item";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const TEMPLATE_HEADERS = [
  "name",
  "generic_name",
  "strength",
  "form",
  "unit",
  "category",
  "is_essential",
  "storage",
  "min_level",
  "reorder_level",
  "max_level",
  "gtin",
] as const;

const TEMPLATE_EXAMPLES = [
  ["Paracetamol", "Paracetamol", "500 mg", "TABLET", "tablet", "Analgesics", "yes", "ROOM", "1000", "2000", "6000", "08901234567890"],
  ["Insulin Regular", "Human insulin", "40 IU/ml", "INJECTION", "vial", "Hormones", "yes", "COLD", "20", "40", "100", ""],
];

/** CSV template for download. UTF-8 with BOM so Excel shows Hindi correctly. */
export function templateCsv(): string {
  return "﻿" + Papa.unparse({ fields: [...TEMPLATE_HEADERS], data: TEMPLATE_EXAMPLES }) + "\r\n";
}

type Field =
  | "name"
  | "genericName"
  | "strength"
  | "form"
  | "unit"
  | "category"
  | "isEssential"
  | "storage"
  | "minLevel"
  | "reorderLevel"
  | "maxLevel"
  | "gtin";

const FIELD_HEADER: Record<Field, string> = {
  name: "name",
  genericName: "generic_name",
  strength: "strength",
  form: "form",
  unit: "unit",
  category: "category",
  isEssential: "is_essential",
  storage: "storage",
  minLevel: "min_level",
  reorderLevel: "reorder_level",
  maxLevel: "max_level",
  gtin: "gtin",
};

// Header text is lower-cased with everything but a-z0-9 removed before lookup.
const ALIASES: Record<string, Field> = {
  name: "name", itemname: "name", medicinename: "name", medicine: "name", item: "name", drugname: "name", drug: "name",
  genericname: "genericName", generic: "genericName",
  strength: "strength", dose: "strength",
  form: "form", dosageform: "form",
  unit: "unit", uom: "unit", unitofmeasure: "unit",
  category: "category",
  isessential: "isEssential", essential: "isEssential", nlem: "isEssential",
  storage: "storage", storagecondition: "storage",
  minlevel: "minLevel", min: "minLevel", minimum: "minLevel", minstock: "minLevel",
  reorderlevel: "reorderLevel", reorder: "reorderLevel", reorderpoint: "reorderLevel",
  maxlevel: "maxLevel", max: "maxLevel", maximum: "maxLevel", maxstock: "maxLevel",
  gtin: "gtin", barcode: "gtin", ean: "gtin", upc: "gtin",
};

const FORM_ALIASES: Record<string, ItemForm> = {
  TABLET: "TABLET", TABLETS: "TABLET", TAB: "TABLET", TABS: "TABLET",
  CAPSULE: "CAPSULE", CAPSULES: "CAPSULE", CAP: "CAPSULE", CAPS: "CAPSULE",
  INJECTION: "INJECTION", INJECTIONS: "INJECTION", INJ: "INJECTION", INJECTABLE: "INJECTION", INFUSION: "INJECTION",
  SYRUP: "SYRUP", SYP: "SYRUP", SUSPENSION: "SYRUP", LIQUID: "SYRUP", ORALLIQUID: "SYRUP",
  OINTMENT: "OINTMENT", OINT: "OINTMENT", CREAM: "OINTMENT", GEL: "OINTMENT", LOTION: "OINTMENT",
  DROPS: "DROPS", DROP: "DROPS", EYEDROPS: "DROPS", EARDROPS: "DROPS", NASALDROPS: "DROPS",
  CONSUMABLE: "CONSUMABLE", CONSUMABLES: "CONSUMABLE", DEVICE: "CONSUMABLE", DISPOSABLE: "CONSUMABLE",
  OTHER: "OTHER", OTHERS: "OTHER", SOLUTION: "OTHER",
};

const COLD_WORDS = new Set(["cold", "coldchain", "refrigerated", "fridge", "2to8", "28", "2to8c", "28c", "2to8degc"]);
const ROOM_WORDS = new Set(["room", "ambient", "normal", "roomtemp", "roomtemperature"]);
const TRUE_WORDS = new Set(["y", "yes", "true", "t", "1", "x", "हाँ", "हां", "हा"]);
const FALSE_WORDS = new Set(["n", "no", "false", "f", "0", "", "नहीं", "नही"]);

const headerKey = (h: string) => h.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (v: unknown) =>
  String(v ?? "")
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type ImportError = { row: number; field?: string; message: string };
export type ImportResult = {
  /** Set when nothing could be processed (empty file, missing required columns...). */
  fatal: string | null;
  warnings: string[];
  items: { row: number; data: ItemInput }[];
  errors: ImportError[];
  skippedBlank: number;
  totalRows: number;
};

function parseLevel(v: string): number | null {
  if (v === "") return 0;
  const s = v.replace(/[,\s]/g, "");
  return /^\d+(\.0+)?$/.test(s) ? Number(s) : null;
}

/**
 * Validates a table (first non-blank row = headers). Row numbers in errors are
 * the row numbers a person sees in Excel. Never throws.
 */
export function validateItemTable(
  table: string[][],
  existingKeys: ReadonlySet<string> = new Set(),
): ImportResult {
  const result: ImportResult = {
    fatal: null,
    warnings: [],
    items: [],
    errors: [],
    skippedBlank: 0,
    totalRows: 0,
  };
  const isBlankRow = (r: string[]) => r.every((c) => clean(c) === "");

  const headerIdx = table.findIndex((r) => !isBlankRow(r));
  if (headerIdx === -1) {
    result.fatal = "The file is empty.";
    return result;
  }

  const colOf = new Map<Field, number>();
  (table[headerIdx] ?? []).forEach((h, i) => {
    const label = clean(h);
    if (!label) return;
    const field = ALIASES[headerKey(label)];
    if (!field) {
      result.warnings.push(`Column "${label}" is not recognised and was ignored.`);
    } else if (colOf.has(field)) {
      result.warnings.push(`Column "${label}" repeats "${FIELD_HEADER[field]}" and was ignored.`);
    } else {
      colOf.set(field, i);
    }
  });

  const missing = (["name", "form"] as Field[]).filter((f) => !colOf.has(f));
  if (missing.length) {
    result.fatal = `Missing required column(s): ${missing.map((f) => FIELD_HEADER[f]).join(", ")}. Expected headers: ${TEMPLATE_HEADERS.join(", ")}.`;
    return result;
  }

  const dataRows = table.slice(headerIdx + 1);
  // the empty line a file always ends with (and any blank lines after the last real row) are not rows
  while (dataRows.length > 0 && isBlankRow(dataRows[dataRows.length - 1]!)) dataRows.pop();
  if (dataRows.length > MAX_IMPORT_ROWS) {
    result.fatal = `Too many rows (${dataRows.length}). Split the file into parts of at most ${MAX_IMPORT_ROWS} rows.`;
    return result;
  }
  result.totalRows = dataRows.length;

  const seen = new Map<string, number>();

  dataRows.forEach((cells, i) => {
    const row = headerIdx + i + 2; // 1-based line in the file
    if (isBlankRow(cells)) {
      result.skippedBlank++;
      return;
    }
    const get = (f: Field) => {
      const idx = colOf.get(f);
      return idx === undefined ? "" : clean(cells[idx]);
    };
    const errs: ImportError[] = [];
    const bad = (f: Field, message: string) => errs.push({ row, field: FIELD_HEADER[f], message });

    // form (required)
    let form: ItemForm | null = null;
    const rawForm = get("form");
    if (rawForm === "") bad("form", "form is required");
    else {
      form = FORM_ALIASES[rawForm.toUpperCase().replace(/[^A-Z]/g, "")] ?? null;
      if (!form) bad("form", `"${rawForm}" is not a known form. Use one of: ${ITEM_FORMS.join(", ")}`);
    }

    // storage
    let storage: StorageType = "ROOM";
    const rawStorage = get("storage");
    if (rawStorage !== "") {
      const k = rawStorage.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (COLD_WORDS.has(k)) storage = "COLD";
      else if (!ROOM_WORDS.has(k)) bad("storage", `"${rawStorage}" is not a known storage. Use ROOM or COLD`);
    }

    // is_essential
    let isEssential = false;
    const rawEss = get("isEssential").toLowerCase();
    if (TRUE_WORDS.has(rawEss)) isEssential = true;
    else if (!FALSE_WORDS.has(rawEss)) bad("isEssential", `"${get("isEssential")}" is not yes/no`);

    // levels
    const levels = {} as Record<"minLevel" | "reorderLevel" | "maxLevel", number>;
    for (const f of ["minLevel", "reorderLevel", "maxLevel"] as const) {
      const n = parseLevel(get(f));
      if (n === null) {
        bad(f, `"${get(f)}" must be a whole number, 0 or more`);
        levels[f] = 0;
      } else levels[f] = n;
    }

    const candidate = {
      name: get("name"),
      genericName: get("genericName") || null,
      strength: get("strength") || null,
      form: form ?? ("OTHER" as ItemForm), // placeholder when invalid; the error is already recorded
      unit: get("unit") || (form ? DEFAULT_UNIT[form] : "unit"),
      category: get("category") || null,
      isEssential,
      storage,
      gtin: get("gtin") || null,
      ...levels,
    };
    const parsed = itemCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const f = issue.path[0] as Field | undefined;
        errs.push({ row, field: f ? FIELD_HEADER[f] : undefined, message: issue.message });
      }
    } else if (errs.length === 0) {
      const data = toItemInput(parsed.data);
      const problem = levelProblem(data);
      if (problem) bad(problem.field, problem.message);
      else {
        const key = itemKey(data.name, data.strength, data.form);
        const first = seen.get(key);
        if (first !== undefined) bad("name", `Duplicate of row ${first} (same name, strength and form)`);
        else if (existingKeys.has(key)) bad("name", "Already in the item list (same name, strength and form)");
        else {
          seen.set(key, row);
          result.items.push({ row, data });
        }
      }
    }
    result.errors.push(...errs);
  });

  return result;
}

export type ParsedFile = { table: string[][]; warnings: string[] } | { fatal: string };

/** Reads a .csv, .xlsx or .xls file into a table of strings. Never throws. */
export function parseItemFile(bytes: Uint8Array, filename: string): ParsedFile {
  if (bytes.byteLength === 0) return { fatal: "The file is empty." };
  if (bytes.byteLength > MAX_IMPORT_BYTES)
    return { fatal: `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.` };
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  try {
    if (ext === "csv" || ext === "txt") {
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
      const warnings = text.includes("�")
        ? ['Some characters could not be read. In Excel use "Save as > CSV UTF-8" so Hindi names are kept.']
        : [];
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
      return { table: parsed.data.map((r) => r.map((c) => String(c ?? ""))), warnings };
    }
    if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(bytes, { type: "array" });
      const first = wb.SheetNames[0];
      const sheet = first ? wb.Sheets[first] : undefined;
      if (!sheet) return { fatal: "The workbook has no sheets." };
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
      });
      return { table: rows.map((r) => r.map((c) => String(c ?? ""))), warnings: [] };
    }
  } catch {
    return { fatal: "The file could not be read. Check that it is a valid CSV or Excel file." };
  }
  return { fatal: "Unsupported file type. Upload a .csv, .xlsx or .xls file." };
}

/** Parse and validate in one step. */
export function importItemsFromBytes(
  bytes: Uint8Array,
  filename: string,
  existingKeys: ReadonlySet<string> = new Set(),
): ImportResult {
  const parsed = parseItemFile(bytes, filename);
  if ("fatal" in parsed) {
    return { fatal: parsed.fatal, warnings: [], items: [], errors: [], skippedBlank: 0, totalRows: 0 };
  }
  const result = validateItemTable(parsed.table, existingKeys);
  result.warnings.unshift(...parsed.warnings);
  return result;
}
