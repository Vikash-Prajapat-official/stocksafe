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

## Phase 2

1. **Auth.js v5 (next-auth@beta), JWT sessions, 12 hour expiry.** Credentials = phone + password, bcrypt cost 12. The JWT only carries the user id. On every API call and page the user is re-read from the database, so a deactivated user or a changed role takes effect immediately. Trade-off: JWTs cannot be revoked, so a password reset does not sign out existing sessions (deactivating the user does).
2. **Every API route is wrapped in `route(roles | "ANY", handler)`** (`src/lib/api.ts`). 401 = not signed in, 403 = wrong role. A unit test scans `src/app/api` and fails if any route (other than `/api/health` and `/api/auth/*`) is not wrapped, and checks 401/403 for every admin route and every role.
3. **Admin screens and APIs are ADMIN only**, including reading stores and suppliers. Later phases will add read-only lookups for the roles that need them (for example suppliers for the GRN screen).
4. **Items: GET is open to any signed-in user; create, edit and import are ADMIN only** (matches the spec's API table). Items are never deleted; use Active = off.
5. **Item identity = name + strength + form** (case and spacing ignored). Used for the 409 on create and for skipping duplicates on import. There is no database unique constraint on it, so two admins importing at the very same moment could create a duplicate; low risk, revisit if seen.
6. **Stock levels: 0 means "not set".** Rule when set: minimum <= reorder <= maximum. A file may give only a minimum.
7. **`unit` is what the store counts in** (tablet, vial, bottle, tube, piece), not the strength. If a file leaves it blank it defaults from the form.
8. **Import creates only.** Existing items are reported as "Already in the item list" and left alone. Valid rows are imported even when other rows fail; each failing row is listed with its row number, column and reason. A "Check file" dry run reports without importing. Limits: 5 MB, 5000 rows.
9. **SheetJS is installed from the SheetJS CDN tarball** (`xlsx@0.20.3`), because the npm registry copy (0.18.5) is old and has known vulnerabilities. This needs network access at `npm install` time only.
10. **NLEM seed is about 430 rows, not 300**: roughly 385 medicines plus about 45 common consumables (non-essential). I compiled it from memory of NLEM 2022 categories. **It has not been checked line by line against the official NLEM 2022 PDF.** Generic name is left blank (the name is already generic). Levels are all 0 until the admin sets them (demo levels come with the Phase 7 demo data). Seed also creates 3 stores, 3 suppliers and 5 demo users (phones 9000000001 to 9000000005, password from `SEED_PASSWORD`, default `ChangeMe@123`); it never overwrites an existing user.
11. **Login rate limit is in memory:** 5 failed attempts per phone and 30 per IP in 15 minutes. It resets when the app restarts. Fine for a single app container.
12. **Last-admin protection:** an admin cannot deactivate or demote themselves, and the last active admin cannot be removed.
13. **UI primitives are hand-written in shadcn/ui style** (Button, Input, Select) instead of using the shadcn CLI, so there is no network step. TanStack Table is not used yet: lists are server-paginated (50 per page). It will be added when a screen needs client-side sorting.
14. **Marketing landing page moved to `src/app/(marketing)/page.tsx`** (placeholder until Phase 6), matching the folder structure in the spec.

## Phase 3

1. **Issue vs transfer.** `issue` takes stock out of a store for consumption or department use (needs a reason) and writes ISSUE. `transfer` moves stock to another store or ward and writes TRANSFER_OUT and TRANSFER_IN together with one shared reference, so the ward then holds that stock. The Issue screen offers both.
2. **FEFO rules** (`src/lib/fefo.ts`). A batch is usable on its expiry date and expired from the next day (India date, IST). Ties on expiry take the smaller batch first, then the lower batch id, so results are repeatable. Expired and empty batches are never used.
3. **Choosing a batch by hand** (override) needs a reason of at least 3 characters, which is stored on the movement ("FEFO override: ..."). Expired batches are refused even with a reason. All other reasons only need to be non-empty.
4. **No overselling, three layers.** (a) Every operation takes a per-item advisory lock, so operations on the same item queue up and cannot deadlock each other. (b) The balance rows it reads are locked with `SELECT ... FOR UPDATE`. (c) The database `CHECK (quantity >= 0)`. A deadlock or write conflict that still happens is retried up to 5 times. I proved the tests catch missing locks by disabling (a) and (b): the multi-batch test failed and the opposing-transfer test deadlocked.
5. **Preview is advisory.** "Review FEFO split" reads without locking; "Confirm" recomputes under lock. If someone else took stock in between, the confirmed split can differ or fail with INSUFFICIENT_STOCK; nothing is ever half-applied.
6. **Receiving.** Batch numbers are compared ignoring case and extra spaces (stored upper case). The same batch number with a different expiry is refused (BATCH_MISMATCH). A later receipt of an existing batch keeps the first price and returns a warning. Already-expired stock cannot be received. Invoice totals must fit in 32-bit paise (about Rs 2.1 crore).
7. **Approvals.** Returns to supplier, expiry write-offs and adjustments need an active ADMIN as approver and a reason. For now the API routes are ADMIN only and the admin who does it is the approver; a request-then-approve workflow (someone else asks, the admin approves) arrives with the expiry centre in Phase 4. Write-off only works on an expired batch; damaged stock is an adjustment. `adjust` has no API route yet because the spec has none; stock count approval (Phase 4) will call it.
8. **Roles follow the spec table literally:** GRN = store keeper only; issue/transfer = store keeper and pharmacist; dispense = pharmacist only. An admin cannot receive or dispense (create a user with that role if one person does everything). Non-admins can only work in stores they are assigned to (`UserStore`); anyone signed in can read stock and the ledger.
9. **Not built:** RETURN_IN (a patient returning medicine) is in the data model but not in the `stock.ts` function list of the spec, so it is not implemented yet.
10. **Two schema additions:** `stock_movement.seq` (insertion order, so the bin card and its running balance are deterministic) and `item.gtin` (14-digit barcode number, optional, set on the item form or in the import file) so a scan can pick the item. Existing items simply have no barcode.
11. **Barcode scanning.** GS1 DataMatrix / GS1-128 codes are parsed for GTIN, expiry (AI 17, or best-before AI 15) and batch (AI 10); a plain EAN/UPC gives a GTIN only. A USB scanner works by typing into the scan box. The camera uses `@zxing/browser`, which browsers only allow on HTTPS or localhost; on plain `http://192.168...` the page says so and the USB or typed route still works. **Camera decoding has not been tested with a real camera** (the typed-code path and the parser are tested).
12. **Audit log** rows (GRN_CREATE, STOCK_ISSUE, STOCK_TRANSFER, STOCK_DISPENSE, STOCK_RETURN, STOCK_WRITEOFF, STOCK_ADJUST) are written inside the same transaction as the stock change.
13. **Bin card** shows newest first and a running balance per store and batch (not one balance across mixed stores).
14. **Dispensing slip** is the page itself printed with the browser's print function (everything else is hidden when printing). One slip per dispensing, with several items allowed.
15. **Integration tests need PostgreSQL.** `npm run test:integration` drops and recreates a database whose name must end in `_test` (default `stocksafe_test` on the compose database at port 5434), runs the migrations, then runs the tests. It refuses to touch any other name. `npm test` stays fast and needs no database.
