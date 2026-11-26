// Errors raised by src/lib/stock.ts. Kept free of database imports so any layer can use them.

export type StockErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INACTIVE"
  | "SAME_STORE"
  | "INSUFFICIENT_STOCK"
  | "EXPIRED_BATCH"
  | "NOT_EXPIRED"
  | "BATCH_MISMATCH"
  | "OVERRIDE_REASON_REQUIRED"
  | "APPROVER_REQUIRED"
  | "INVALID_STATE";

const STATUS: Record<StockErrorCode, number> = {
  VALIDATION: 400,
  OVERRIDE_REASON_REQUIRED: 400,
  SAME_STORE: 400,
  APPROVER_REQUIRED: 403,
  NOT_FOUND: 404,
  INACTIVE: 409,
  INSUFFICIENT_STOCK: 409, // SPEC section 7
  EXPIRED_BATCH: 409,
  NOT_EXPIRED: 409,
  BATCH_MISMATCH: 409,
  INVALID_STATE: 409, // the record is not in a state that allows this (for example an indent already issued)
};

export class StockError extends Error {
  readonly status: number;
  constructor(
    public readonly code: StockErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StockError";
    this.status = STATUS[code];
  }
}
