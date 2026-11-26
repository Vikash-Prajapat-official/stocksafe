# Decisions

Where SPEC.md was unclear I chose the simplest option and wrote it here.

## Phase 1

1. **Spec file name.** The file was saved as `Spec.md`; renamed to `SPEC.md` to match the spec.
2. **Prisma 6, Tailwind 4, Zod 4.** Prisma 7 changes configuration and client generation; Prisma 6 is the stable, widely documented choice for this stack.
3. **Money and quantity are 32-bit `Int`.** Max about Rs 2.1 crore per price field and 2.1 billion units. Fine for a hospital store. `Grn.total_paise` could in theory exceed that for a very large invoice; revisit with `BigInt` if a real user hits it.
4. **Append-only ledger enforced in the database too.** Besides the rule in `stock.ts`, the first migration adds a trigger that rejects `UPDATE` and `DELETE` on `stock_movement`, and a `CHECK (quantity >= 0)` on `stock_balance`.
5. **Table names are snake_case** (`stock_movement`, `stock_balance`, ...) via `@@map`, matching the spec's field names; Prisma models stay PascalCase.
6. **Hospital is a single row.** One install = one hospital; `settings` is JSON.
7. **Indent direction.** `from_store_id` is the requesting ward, `to_store_id` is the supplying store (SPEC does not say).
8. **One image for app and worker.** The worker runs `tsx` from the same image with a different command. Bigger image than a standalone Next build, but one Dockerfile and no packaging surprises. The Postgres port is also published on 127.0.0.1:5434 only (5432 and 5433 are used by sibling apps; override with DB_PORT) for local tools.
9. **Backup service is Phase 5.** Phase 1 compose has app, worker, db only, as the phase list says.
10. **shadcn/ui.** `components.json` and the `cn` helper are in place; individual components are added as screens need them. `next-intl`, Auth.js, bcrypt, papaparse etc. are installed in the phase that first uses them.
11. **Health.** `GET /api/health` is public (needed by Docker healthcheck) and returns only ok/down; `/health` is a small page showing the same.
