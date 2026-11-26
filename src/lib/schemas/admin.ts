import { z } from "zod";
import { ROLES } from "@/lib/rbac";
import { normalizePhone } from "@/lib/phone";

export const STORE_TYPES = ["MAIN", "PHARMACY", "WARD"] as const;

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(STORE_TYPES),
});
export const storePatchSchema = storeCreateSchema.partial().extend({ active: z.boolean().optional() });

const GSTIN = /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]$/;
const optional = (s: z.ZodString) => z.union([s, z.literal("")]).nullable().optional();

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: optional(z.string().trim().regex(/^[0-9+\-() ]{5,20}$/, "Enter a valid phone number")),
  gstin: optional(z.string().trim().regex(GSTIN, "Enter a valid 15-character GSTIN")),
  address: optional(z.string().trim().max(300)),
});
export const supplierPatchSchema = supplierCreateSchema.partial();

const phone = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, "Enter a valid 10-digit Indian mobile number");
// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Password is too long (72 bytes max)");

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone,
  password,
  role: z.enum(ROLES),
  storeIds: z.array(z.string().min(1)).max(200).optional(),
  active: z.boolean().optional(),
});
export const userPatchSchema = userCreateSchema.partial();

/** Empty or whitespace-only text becomes null (for optional columns). */
export function blankToNull(v: string | null | undefined): string | null {
  return v && v.trim() ? v.trim() : null;
}
