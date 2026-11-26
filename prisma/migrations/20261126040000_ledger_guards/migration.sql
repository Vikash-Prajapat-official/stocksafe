-- Balances can never go below zero (SPEC section 4).
ALTER TABLE "stock_balance"
  ADD CONSTRAINT "stock_balance_quantity_nonnegative" CHECK ("quantity" >= 0);

-- The ledger is append-only: reject UPDATE and DELETE on stock_movement.
CREATE OR REPLACE FUNCTION stock_movement_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movement is append-only: % is not allowed. Add a correcting ADJUSTMENT row instead.', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movement_no_update_delete
  BEFORE UPDATE OR DELETE ON "stock_movement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();

-- TRUNCATE bypasses row triggers, so block it as well.
CREATE TRIGGER stock_movement_no_truncate
  BEFORE TRUNCATE ON "stock_movement"
  FOR EACH STATEMENT EXECUTE FUNCTION stock_movement_append_only();
