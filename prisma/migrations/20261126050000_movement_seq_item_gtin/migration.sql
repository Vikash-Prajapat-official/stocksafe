-- Item barcode (GTIN) so a scanned code can pick the item.
ALTER TABLE "item" ADD COLUMN "gtin" TEXT;
CREATE INDEX "item_gtin_idx" ON "item"("gtin");

-- Insertion order of ledger rows, so the bin card and its running balance are deterministic.
-- No movements existed before this migration (stock.ts arrives in the same phase), so there is nothing to backfill;
-- the ledger is append-only and could not be updated anyway.
ALTER TABLE "stock_movement" ADD COLUMN "seq" SERIAL NOT NULL;
CREATE UNIQUE INDEX "stock_movement_seq_key" ON "stock_movement"("seq");
