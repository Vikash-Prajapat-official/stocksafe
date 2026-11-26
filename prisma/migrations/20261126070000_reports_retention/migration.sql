-- ---------------------------------------------------------------------------------------------
-- 1. Patient labels move out of the ledger.
--    stock_movement is append-only (nothing may update it), but patient names must be anonymised after
--    RETENTION_DAYS. So the label lives in its own table, one row per dispensing movement; the retention
--    job clears the label here and the ledger row is never touched.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "movement_patient" (
  "movement_id"   TEXT NOT NULL,
  "label"         TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "anonymised_at" TIMESTAMP(3),
  CONSTRAINT "movement_patient_pkey" PRIMARY KEY ("movement_id"),
  CONSTRAINT "movement_patient_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- the nightly job only looks at labels that are still readable
CREATE INDEX "movement_patient_retention_idx" ON "movement_patient"("created_at") WHERE "anonymised_at" IS NULL;

INSERT INTO "movement_patient" ("movement_id", "label", "created_at")
SELECT "id", "patient_label", "at" FROM "stock_movement" WHERE "patient_label" IS NOT NULL;

ALTER TABLE "stock_movement" DROP COLUMN "patient_label";

-- ---------------------------------------------------------------------------------------------
-- 2. The audit log is append-only too ("audit-ready").
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_guard();

-- ---------------------------------------------------------------------------------------------
-- 3. Views the reports read from (SPEC section 5: "Reports read from SQL views over StockMovement").
--    Months and days are India time.
-- ---------------------------------------------------------------------------------------------
CREATE VIEW "report_stock_on_hand" AS
SELECT sb.store_id, s.name AS store_name,
       b.item_id, i.name AS item_name, i.strength, i.unit,
       sb.batch_id, b.batch_no, b.expiry_date,
       sb.quantity, b.cost_paise,
       (sb.quantity::bigint * b.cost_paise::bigint) AS value_paise
FROM stock_balance sb
JOIN batch b ON b.id = sb.batch_id
JOIN item i ON i.id = b.item_id
JOIN store s ON s.id = sb.store_id;

CREATE VIEW "report_consumption" AS
SELECT (date_trunc('month', m."at" AT TIME ZONE 'Asia/Kolkata'))::date AS month,
       m.store_id, b.item_id,
       COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'ISSUE'), 0)::bigint AS qty_issued,
       COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'DISPENSE'), 0)::bigint AS qty_dispensed,
       COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'EXPIRY_WRITEOFF'), 0)::bigint AS qty_written_off,
       COALESCE(SUM(-m.quantity::bigint * b.cost_paise::bigint) FILTER (WHERE m.type IN ('ISSUE', 'DISPENSE')), 0)::bigint AS value_consumed_paise
FROM stock_movement m
JOIN batch b ON b.id = m.batch_id
WHERE m.type IN ('ISSUE', 'DISPENSE', 'EXPIRY_WRITEOFF')
GROUP BY 1, 2, 3;
