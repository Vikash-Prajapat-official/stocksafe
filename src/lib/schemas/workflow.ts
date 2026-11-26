import { z } from "zod";

const id = z.string().min(1).max(64);
const qty = z.number().int("Must be a whole number").min(1, "Must be at least 1").max(100_000, "Too large");

export const indentCreateSchema = z.object({
  fromStoreId: id,
  toStoreId: id,
  note: z.string().trim().max(300).nullish(),
  /** true = send it to the store straight away instead of keeping a draft. */
  submit: z.boolean().optional(),
  lines: z.array(z.object({ itemId: id, quantity: qty })).min(1, "Add at least one item").max(100),
});

export const indentApproveSchema = z.object({
  /** Leave out to approve everything as requested. A line can be approved for less, down to 0. */
  approvals: z.array(z.object({ lineId: id, qtyApproved: z.number().int().min(0) })).max(100).optional(),
  note: z.string().trim().max(300).nullish(),
});

export const indentRejectSchema = z.object({ note: z.string().trim().min(1, "Give a reason").max(300) });
export const indentCloseSchema = z.object({ note: z.string().trim().max(300).nullish() });

export const countStartSchema = z.object({ storeId: id });

export const countPatchSchema = z
  .object({
    lines: z.array(z.object({ lineId: id, countedQty: z.number().int().min(0).max(10_000_000).nullable() })).max(5000).optional(),
    action: z.enum(["submit", "reopen"]).optional(),
  })
  .refine((v) => v.lines !== undefined || v.action !== undefined, "Send lines to save, or an action");
