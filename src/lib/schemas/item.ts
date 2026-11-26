import { z } from "zod";

export const ITEM_FORMS = [
  "TABLET",
  "CAPSULE",
  "INJECTION",
  "SYRUP",
  "OINTMENT",
  "DROPS",
  "CONSUMABLE",
  "OTHER",
] as const;
export const STORAGES = ["ROOM", "COLD"] as const;
export type ItemForm = (typeof ITEM_FORMS)[number];
export type StorageType = (typeof STORAGES)[number];

/** Stock is counted in this unit unless the user says otherwise (e.g. a vial, not a mg). */
export const DEFAULT_UNIT: Record<ItemForm, string> = {
  TABLET: "tablet",
  CAPSULE: "capsule",
  INJECTION: "vial",
  SYRUP: "bottle",
  OINTMENT: "tube",
  DROPS: "bottle",
  CONSUMABLE: "piece",
  OTHER: "pack",
};

const level = z
  .number()
  .int("Must be a whole number")
  .min(0, "Cannot be negative")
  .max(100_000_000, "Too large");
const optText = (max: number) =>
  z.string().trim().max(max, `At most ${max} characters`).nullable().optional();

const itemFields = {
  name: z.string().trim().min(1, "Name is required").max(200, "At most 200 characters"),
  genericName: optText(200),
  strength: optText(100),
  form: z.enum(ITEM_FORMS),
  unit: z.string().trim().min(1, "Unit is required").max(30, "At most 30 characters"),
  category: optText(100),
  isEssential: z.boolean(),
  storage: z.enum(STORAGES),
  minLevel: level,
  reorderLevel: level,
  maxLevel: level,
  // Barcode number printed on the pack (8 to 14 digits). Stored as 14 digits. Blank = none.
  gtin: z.union([z.string().trim().regex(/^\d{8,14}$/, "GTIN must be 8 to 14 digits"), z.literal("")]).nullable().optional(),
};

// No transforms or defaults here on purpose: they would misbehave under .partial() (PATCH).
export const itemCreateSchema = z.object(itemFields).partial({
  isEssential: true,
  storage: true,
  minLevel: true,
  reorderLevel: true,
  maxLevel: true,
});
export const itemPatchSchema = z
  .object(itemFields)
  .partial()
  .extend({ active: z.boolean().optional() });

export type ItemInput = {
  name: string;
  genericName: string | null;
  strength: string | null;
  form: ItemForm;
  unit: string;
  category: string | null;
  isEssential: boolean;
  storage: StorageType;
  minLevel: number;
  reorderLevel: number;
  maxLevel: number;
  gtin: string | null;
};

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** 8 to 14 digit barcode number to the 14-digit form used for matching; blank gives null. */
export function normalizeGtin(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return /^\d{8,14}$/.test(s) ? s.padStart(14, "0") : null;
}

/** Fills defaults and turns empty text into null. */
export function toItemInput(v: z.infer<typeof itemCreateSchema>): ItemInput {
  return {
    name: v.name,
    genericName: blank(v.genericName),
    strength: blank(v.strength),
    form: v.form,
    unit: v.unit,
    category: blank(v.category),
    isEssential: v.isEssential ?? false,
    storage: v.storage ?? "ROOM",
    minLevel: v.minLevel ?? 0,
    reorderLevel: v.reorderLevel ?? 0,
    maxLevel: v.maxLevel ?? 0,
    gtin: normalizeGtin(v.gtin),
  };
}

export type LevelProblem = { field: "reorderLevel" | "maxLevel"; message: string };

/**
 * When set, min <= reorder <= max. A level of 0 means "not set", so a file or form that
 * gives only a minimum (or only a reorder level) is accepted.
 */
export function levelProblem(v: {
  minLevel: number;
  reorderLevel: number;
  maxLevel: number;
}): LevelProblem | null {
  if (v.reorderLevel > 0 && v.reorderLevel < v.minLevel)
    return { field: "reorderLevel", message: "Reorder level cannot be below the minimum level" };
  if (v.maxLevel > 0 && v.maxLevel < v.reorderLevel)
    return { field: "maxLevel", message: "Maximum level cannot be below the reorder level" };
  return null;
}

/** Identity of an item for duplicate detection: same name, strength and form. */
export function itemKey(name: string, strength: string | null | undefined, form: string): string {
  return [name, strength ?? "", form]
    .map((s) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}
