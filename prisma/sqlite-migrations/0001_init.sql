-- CreateTable
CREATE TABLE "hospital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "drug_licence_no" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "user_store" (
    "user_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "store_id"),
    CONSTRAINT "user_store_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_store_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "strength" TEXT,
    "form" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "is_essential" BOOLEAN NOT NULL DEFAULT false,
    "storage" TEXT NOT NULL DEFAULT 'ROOM',
    "min_level" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "max_level" INTEGER NOT NULL DEFAULT 0,
    "gtin" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "gstin" TEXT,
    "address" TEXT
);

-- CreateTable
CREATE TABLE "batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "expiry_date" DATETIME NOT NULL,
    "mrp_paise" INTEGER NOT NULL,
    "cost_paise" INTEGER NOT NULL,
    "supplier_id" TEXT,
    CONSTRAINT "batch_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "store_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    PRIMARY KEY ("store_id", "batch_id"),
    CONSTRAINT "stock_balance_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_balance_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "reason" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "approved_by" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movement_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movement_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movement_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movement_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "movement_patient" (
    "movement_id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymised_at" DATETIME,
    CONSTRAINT "movement_patient_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "grn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplier_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_date" DATETIME NOT NULL,
    "received_by" TEXT NOT NULL,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_paise" INTEGER NOT NULL,
    CONSTRAINT "grn_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "grn_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "indent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "from_store_id" TEXT NOT NULL,
    "to_store_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "decision_note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "indent_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "indent_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "indent_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "indent_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "indent_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty_requested" INTEGER NOT NULL,
    "qty_approved" INTEGER,
    "qty_issued" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "indent_line_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "indent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "indent_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_count" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "store_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "started_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    "approved_at" DATETIME,
    CONSTRAINT "stock_count_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "count_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    CONSTRAINT "stock_count_line_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_count" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_line_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "store_name_key" ON "store"("name");

-- CreateIndex
CREATE INDEX "item_name_idx" ON "item"("name");

-- CreateIndex
CREATE INDEX "item_gtin_idx" ON "item"("gtin");

-- CreateIndex
CREATE INDEX "batch_expiry_date_idx" ON "batch"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "batch_item_id_batch_no_key" ON "batch"("item_id", "batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_seq_key" ON "stock_movement"("seq");

-- CreateIndex
CREATE INDEX "stock_movement_batch_id_store_id_at_idx" ON "stock_movement"("batch_id", "store_id", "at");

-- CreateIndex
CREATE INDEX "stock_movement_store_id_at_idx" ON "stock_movement"("store_id", "at");

-- CreateIndex
CREATE INDEX "stock_movement_type_at_idx" ON "stock_movement"("type", "at");

-- CreateIndex
CREATE UNIQUE INDEX "indent_seq_key" ON "indent"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "indent_line_indent_id_item_id_key" ON "indent_line"("indent_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_seq_key" ON "stock_count"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_line_count_id_batch_id_key" ON "stock_count_line"("count_id", "batch_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");


-- ---------------------------------------------------------------------------------------------
-- Guards (the same promises the PostgreSQL migrations make), written in SQLite's dialect.
-- ---------------------------------------------------------------------------------------------

-- Balances can never go below zero.
CREATE TRIGGER "stock_balance_nonnegative_ins" BEFORE INSERT ON "stock_balance"
WHEN NEW."quantity" < 0
BEGIN SELECT RAISE(ABORT, 'stock_balance_quantity_nonnegative: quantity must be >= 0'); END;

CREATE TRIGGER "stock_balance_nonnegative_upd" BEFORE UPDATE ON "stock_balance"
WHEN NEW."quantity" < 0
BEGIN SELECT RAISE(ABORT, 'stock_balance_quantity_nonnegative: quantity must be >= 0'); END;

-- The ledger and the audit log are append-only.
CREATE TRIGGER "stock_movement_no_update" BEFORE UPDATE ON "stock_movement"
BEGIN SELECT RAISE(ABORT, 'stock_movement is append-only: UPDATE is not allowed. Add a correcting ADJUSTMENT row instead.'); END;

CREATE TRIGGER "stock_movement_no_delete" BEFORE DELETE ON "stock_movement"
BEGIN SELECT RAISE(ABORT, 'stock_movement is append-only: DELETE is not allowed. Add a correcting ADJUSTMENT row instead.'); END;

CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log"
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not allowed'); END;

CREATE TRIGGER "audit_log_no_delete" BEFORE DELETE ON "audit_log"
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not allowed'); END;

-- Indent and count line sanity.
CREATE TRIGGER "indent_line_ranges_ins" BEFORE INSERT ON "indent_line"
WHEN NEW."qty_requested" <= 0
  OR (NEW."qty_approved" IS NOT NULL AND (NEW."qty_approved" < 0 OR NEW."qty_approved" > NEW."qty_requested"))
  OR NEW."qty_issued" < 0 OR NEW."qty_issued" > COALESCE(NEW."qty_approved", 0)
BEGIN SELECT RAISE(ABORT, 'indent_line quantity out of range'); END;

CREATE TRIGGER "indent_line_ranges_upd" BEFORE UPDATE ON "indent_line"
WHEN NEW."qty_requested" <= 0
  OR (NEW."qty_approved" IS NOT NULL AND (NEW."qty_approved" < 0 OR NEW."qty_approved" > NEW."qty_requested"))
  OR NEW."qty_issued" < 0 OR NEW."qty_issued" > COALESCE(NEW."qty_approved", 0)
BEGIN SELECT RAISE(ABORT, 'indent_line quantity out of range'); END;

CREATE TRIGGER "stock_count_line_qty_ins" BEFORE INSERT ON "stock_count_line"
WHEN NEW."system_qty" < 0 OR (NEW."counted_qty" IS NOT NULL AND NEW."counted_qty" < 0)
BEGIN SELECT RAISE(ABORT, 'stock_count_line quantity must be >= 0'); END;

CREATE TRIGGER "stock_count_line_qty_upd" BEFORE UPDATE ON "stock_count_line"
WHEN NEW."system_qty" < 0 OR (NEW."counted_qty" IS NOT NULL AND NEW."counted_qty" < 0)
BEGIN SELECT RAISE(ABORT, 'stock_count_line quantity must be >= 0'); END;

-- At most one count in progress (OPEN or SUBMITTED) per store.
CREATE UNIQUE INDEX "stock_count_one_active_per_store" ON "stock_count"("store_id") WHERE "status" IN ('OPEN', 'SUBMITTED');

-- The nightly retention job only looks at labels that are still readable.
CREATE INDEX "movement_patient_retention_idx" ON "movement_patient"("created_at") WHERE "anonymised_at" IS NULL;
