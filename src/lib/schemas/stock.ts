import { z } from "zod";
import { MAX_PAISE } from "@/lib/money";

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");
const qty = z.number().int("Must be a whole number").min(1, "Must be at least 1").max(10_000_000, "Too large");
const paise = z.number().int("Must be whole paise").min(0).max(MAX_PAISE);

export const stockLineSchema = z.object({
  itemId: id,
  quantity: qty,
  /** Choose a batch by hand (needs overrideReason). */
  batchId: id.nullish(),
  overrideReason: z.string().trim().max(200).nullish(),
});

export const grnSchema = z.object({
  storeId: id,
  supplierId: id,
  invoiceNo: z.string().trim().min(1, "Invoice number is required").max(60),
  invoiceDate: day,
  lines: z
    .array(
      z.object({
        itemId: id,
        batchNo: z.string().trim().min(1, "Batch number is required").max(40),
        expiryDate: day,
        quantity: qty,
        mrpPaise: paise,
        costPaise: paise,
      }),
    )
    .min(1, "Add at least one line")
    .max(200),
});

export const issueSchema = z
  .object({
    mode: z.enum(["ISSUE", "TRANSFER"]),
    fromStoreId: id,
    toStoreId: id.optional(),
    reason: z.string().trim().max(200).optional(),
    /** true = only show the FEFO split, write nothing. */
    preview: z.boolean().optional(),
    lines: z.array(stockLineSchema).min(1, "Add at least one line").max(200),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "TRANSFER" && !v.toStoreId) ctx.addIssue({ code: "custom", path: ["toStoreId"], message: "Choose the destination store" });
    if (v.mode === "ISSUE" && !v.reason?.trim()) ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required (for example Ward consumption)" });
  });

export const dispenseSchema = z.object({
  storeId: id,
  patientLabel: z.string().trim().max(100).nullish(),
  preview: z.boolean().optional(),
  lines: z.array(stockLineSchema).min(1, "Add at least one line").max(200),
});

export const writeoffSchema = z.object({
  storeId: id,
  batchId: id,
  quantity: qty,
  reason: z.string().trim().max(200).nullish(),
});

export const returnSchema = z.object({
  storeId: id,
  batchId: id,
  quantity: qty,
  reason: z.string().trim().min(1, "A reason is required").max(200),
});
