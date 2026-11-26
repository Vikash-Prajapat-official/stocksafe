-- Indents: human number, notes, approved quantity per line.
ALTER TABLE "indent" ADD COLUMN "seq" SERIAL NOT NULL,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "decision_note" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "indent_seq_key" ON "indent"("seq");

ALTER TABLE "indent_line" ADD COLUMN "qty_approved" INTEGER;
CREATE UNIQUE INDEX "indent_line_indent_id_item_id_key" ON "indent_line"("indent_id", "item_id");

-- Stock counts: human number and timestamps; one line per batch.
ALTER TABLE "stock_count" ADD COLUMN "seq" SERIAL NOT NULL,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "stock_count_seq_key" ON "stock_count"("seq");
CREATE UNIQUE INDEX "stock_count_line_count_id_batch_id_key" ON "stock_count_line"("count_id", "batch_id");

-- Safety nets in the database itself (the application checks the same things first).
ALTER TABLE "indent_line"
  ADD CONSTRAINT "indent_line_requested_positive" CHECK ("qty_requested" > 0),
  ADD CONSTRAINT "indent_line_approved_range" CHECK ("qty_approved" IS NULL OR ("qty_approved" >= 0 AND "qty_approved" <= "qty_requested")),
  ADD CONSTRAINT "indent_line_issued_range" CHECK ("qty_issued" >= 0 AND "qty_issued" <= COALESCE("qty_approved", 0));

ALTER TABLE "stock_count_line"
  ADD CONSTRAINT "stock_count_line_qty_nonnegative" CHECK ("system_qty" >= 0 AND ("counted_qty" IS NULL OR "counted_qty" >= 0));

-- At most one count in progress (OPEN or SUBMITTED) per store, even if two people start one at the same moment.
CREATE UNIQUE INDEX "stock_count_one_active_per_store" ON "stock_count"("store_id") WHERE "status" IN ('OPEN', 'SUBMITTED');
