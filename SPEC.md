# StockSafe: Pharmacy Stock and Expiry Tracker Spec

Nov 24, 2026 · @Vikash

StockSafe is a free, open-source stock and expiry tracker for hospital stores and pharmacies: batch and expiry tracking, first-expiry-first-out issuing, and alerts before medicines expire or run out.

## Build it in VS Code with Claude Code

Save this doc as `SPEC.md` in an empty folder, open the folder in VS Code, and paste the master prompt below into Claude Code. Then paste the phase prompts one at a time.

### One-time setup (about 20 minutes, skip what you already did)

1. Install **Node.js 20 LTS** or newer, **Git**, and **Docker Desktop** (on Windows, turn on WSL 2 when Docker asks).
2. Create an empty folder called `stocksafe` and open it in VS Code (File > Open Folder).
3. Put this spec in the folder as `SPEC.md`. `Open the Export menu under this doc's title, choose Markdown, then move the downloaded file into the folder and rename it SPEC.md`.
4. Open Claude Code in VS Code (the Claude icon in the sidebar, or Ctrl+Esc / Cmd+Esc).
5. Paste the **master prompt**. Read and approve file edits and commands when asked.
6. After each phase, run `docker compose up -d`, open http://localhost:3002 and click around before pasting the next phase prompt.
7. Optional: create an empty GitHub repo and ask Claude Code "push this to my GitHub repo \<url>".

### Master prompt (paste first)

```
You are building StockSafe, a free open-source pharmacy and store stock,
expiry and reorder tracker for Indian hospitals. The complete spec is in
SPEC.md in this folder. Read the whole of SPEC.md before writing any code.

Rules for the whole project:
- Use exactly the tech stack in SPEC.md (Next.js 15 App Router + TypeScript,
  Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Auth.js credentials,
  next-intl with English and Hindi, Zod, Vitest, fast-check, Playwright,
  Docker Compose). Do not add paid services.
- All stock changes go through src/lib/stock.ts only, inside a database
  transaction that also writes a StockMovement. The ledger is append-only:
  never update or delete a StockMovement. Write the unit and property
  tests for stock.ts before the code.
- Work in the phases in SPEC.md section "Build phases". Do only Phase 1
  now, then stop and tell me how to run and check it.
- Commit to git after each phase with a clear message.
- Every API route checks the user's role on the server.
- Keep a DECISIONS.md file: when the spec is unclear, choose the simplest
  option, write it down, and continue. Ask me only if a choice would change
  what the product does.

Start Phase 1 now.
```

### Phase prompts (paste one at a time, after checking the previous phase)

```
Phase 2: Do Phase 2 from SPEC.md (auth, roles, stores, suppliers, item
master with CSV/Excel import and the NLEM seed). Stop and tell me how to
check it.
```

```
Phase 3: Do Phase 3 from SPEC.md (stock.ts with tests first: receive, issue
with FEFO, transfer, dispense, adjust, write-off; GRN screen with barcode
scan; issue and dispense screens; ledger; concurrency test).
```

```
Phase 4: Do Phase 4 from SPEC.md (indents, expiry centre, low-stock reorder
list, dashboard, stock count with variance and approval).
```

```
Phase 5: Do Phase 5 from SPEC.md (reports, CSV and PDF export, nightly alert
job and email digest, backups, audit log, retention of patient names).
```

```
Phase 6: Do Phase 6 from SPEC.md (landing page at / exactly as specified,
Hindi translations for every screen, PWA, single-PC SQLite mode).
```

```
Phase 7: Do Phase 7 from SPEC.md (Playwright end-to-end tests, messy CSV
import test, GitHub Actions CI, README with 3-command install,
ADMIN_GUIDE.md, 6 months of demo movements). Run all tests and fix
failures. Then give me a final checklist of what to test by hand before
showing it to a hospital.
```

### If something goes wrong

- Paste the exact error into Claude Code and say "fix this".
- If Docker will not start on Windows, ask: "set up the project to run without Docker using a local PostgreSQL install" (or use single-PC SQLite mode from Phase 6).
- In a new conversation, say: "Read SPEC.md and DECISIONS.md, check git log, and continue from the next unfinished phase".

## Principles and tech stack

### Principles

- **Free and self-hosted:** MIT licence, one `docker compose up -d`, runs on a 2 GB RAM PC; a single-PC SQLite mode for very small clinics.
- **The ledger is the truth:** every stock change is an append-only movement; balances are derived and always match the ledger.
- **FEFO by default:** the system always picks the earliest-expiring batch.
- **Works without internet** on the hospital LAN; email digest is optional.
- **Hindi and English from day one.**
- **Audit-ready:** every adjustment and write-off has a reason, a user and an approval.

### Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS + shadcn/ui; TanStack Table for big lists |
| Backend | Next.js route handlers and server actions; Zod validation |
| Database | PostgreSQL 16 via Prisma ORM (SQLite allowed in single-PC mode) |
| Money and quantity | Integers: paise for money, smallest unit for quantity (no floats) |
| Auth | Auth.js credentials (phone + password, bcrypt), roles |
| i18n | next-intl (en, hi) |
| Barcode | @zxing/browser camera scanning (GS1 DataMatrix and 1D barcodes) |
| Import / export | papaparse (CSV), SheetJS (xlsx), @react-pdf/renderer (PDF reports) |
| Jobs | node-cron in a `worker` container (alerts, digest, retention) |
| Email | Nodemailer over any SMTP (optional) |
| Tests | Vitest, fast-check (property tests), Playwright |
| Packaging | Dockerfile + docker-compose.yml: app, worker, postgres, backup |
| CI | GitHub Actions: lint, typecheck, test, build image |

### Folder structure

```
stocksafe/
  SPEC.md  DECISIONS.md  README.md  ADMIN_GUIDE.md  LICENSE (MIT)
  docker-compose.yml  Dockerfile  .env.example
  prisma/schema.prisma  prisma/seed.ts  prisma/data/nlem-items.csv
  src/app/(marketing)/page.tsx       landing page
  src/app/(app)/dashboard/  items/  grn/  issue/  dispense/  indents/
  src/app/(app)/expiry/  reorder/  counts/  reports/  admin/
  src/app/api/...
  src/lib/stock.ts                   all stock changes (unit + property tested)
  src/lib/fefo.ts  src/lib/reorder.ts  src/lib/auth.ts  src/lib/audit.ts
  src/worker/index.ts                nightly alerts and digest
  messages/en.json  messages/hi.json
  tests/unit  tests/e2e  tests/fixtures/messy-items.csv
```

### Environment variables (.env.example)

| Name | Example | Purpose |
| --- | --- | --- |
| DATABASE\_URL | postgresql://stocksafe:change-me@db:5432/stocksafe | Database (or file:./stocksafe.db) |
| AUTH\_SECRET | (random 32 bytes) | Session signing |
| APP\_URL | http://192.168.1.10:3002 | Links |
| PORT | 3002 | Runs beside the other two apps |
| EXPIRY\_ALERT\_DAYS | 90,60,30 | Alert bands |
| SMTP\_URL | (empty) | Optional email digest |
| DIGEST\_TO | (empty) | Comma-separated emails |
| RETENTION\_DAYS | 90 | Patient names on dispensing anonymised after this |
| BACKUP\_PASSPHRASE | (strong passphrase) | Encrypts backups |

## Product spec

### 1. Problem and evidence

- Stores and pharmacies in small and public hospitals often run on paper bin cards and Excel. Expiry is checked by hand once a month, so near-expiry batches are found too late, and reorders happen only after a shelf is empty.
- Peer-reviewed studies of Indian public facilities report gaps in essential medicine availability and weak storage and record-keeping, for example in two North Indian states ([BMC Pharmacology and Toxicology, 2015](https://link.springer.com/10.1186/s40360-015-0043-8)) and in Puducherry ([PMC8654139](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8654139/); [PMC8853832](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8853832/)). **To do:** confirm the exact availability percentages from the full papers before using numbers on the landing page.
- Government uses state systems (DVDMS / e-Aushadhi) for warehouses, but many CHCs, nursing homes, trust and NGO hospitals have nothing free and simple for their own store and dispensary. StockSafe targets them, with CSV import/export so it can sit beside state systems.

### 2. Users

| Role | What they do |
| --- | --- |
| Store keeper (STOREKEEPER) | Receives stock (GRN) with batch and expiry, issues to wards and pharmacy, runs stock counts |
| Pharmacist (PHARMACIST) | Dispenses, handles returns, works the expiry list |
| Ward nurse (NURSE) | Raises indents for ward stock, receives them |
| Admin / purchase officer (ADMIN) | Sets min/reorder/max levels, approves adjustments and write-offs, reports |
| Auditor (AUDITOR) | Read-only ledger and reports |

### 3. Features

**MVP**

- Item master: name, generic name, strength, form (TABLET, CAPSULE, INJECTION, SYRUP, OINTMENT, DROPS, CONSUMABLE, OTHER), unit, category, is\_essential (NLEM), storage (ROOM, COLD 2 to 8 C), min, reorder and max levels.
- Item import from CSV / Excel with a template; seed of about 300 common NLEM 2022 items.
- Suppliers.
- Stores: Main store, Pharmacy, each ward; stock per store per batch.
- Goods receipt (GRN): supplier, invoice no. and date, lines with batch no., expiry, quantity, MRP and purchase price; camera barcode scan fills fields where the barcode carries them.
- Issue / transfer with FEFO: earliest expiry batch picked automatically, expired batches never issued; override needs a reason.
- Indents: ward requests, store approves fully or partly and issues.
- Dispense: item, quantity, optional patient name or OPD token, print slip.
- Expiry centre: expired, under 30, 60, 90 days, with rupee value; actions write off, return to supplier, transfer.
- Low-stock list: below reorder level, suggested quantity = max minus on-hand.
- Stock count: count sheet per store on mobile, variance report, ADMIN approval creates ADJUSTMENT movements.
- Ledger (bin card) per item and batch with running balance.
- Dashboard and reports: stock on hand (qty, value), near-expiry value, monthly consumption, stock-out days, ABC analysis; CSV and PDF.
- Nightly alert job and optional email digest.

**Later (v2+, do not build now)**

- Purchase orders with approval.
- Consumption-based reorder with lead time.
- Cold chain temperature log.
- NDPS narcotics register with double sign-off.
- Near-expiry exchange list between nearby hospitals.
- Links to QueueCare (dispense by token) and BedBoard (indent by admission).

### 4. Data model

| Table | Fields |
| --- | --- |
| Hospital | id, name, gstin?, drug\_licence\_no?, settings JSON |
| User | id, name, phone (unique), password\_hash, role, active |
| UserStore | user\_id, store\_id |
| Store | id, name, type (MAIN, PHARMACY, WARD), active |
| Item | id, name, generic\_name, strength, form, unit, category, is\_essential, storage, min\_level, reorder\_level, max\_level, active |
| Supplier | id, name, phone?, gstin?, address? |
| Batch | id, item\_id, batch\_no, expiry\_date, mrp\_paise, cost\_paise, supplier\_id?; unique (item\_id, batch\_no) |
| StockBalance | store\_id + batch\_id (primary key), quantity (CHECK quantity >= 0) |
| StockMovement | id, type (RECEIPT, ISSUE, TRANSFER\_OUT, TRANSFER\_IN, DISPENSE, RETURN\_IN, RETURN\_TO\_SUPPLIER, ADJUSTMENT, EXPIRY\_WRITEOFF), batch\_id, store\_id, quantity (signed: + in, minus out), ref\_type, ref\_id, reason?, patient\_label?, actor\_user\_id, approved\_by?, at |
| Grn | id, supplier\_id, invoice\_no, invoice\_date, received\_by, received\_at, total\_paise |
| Indent + IndentLine | id, from\_store\_id, to\_store\_id, status (DRAFT, SUBMITTED, APPROVED, PARTIAL, ISSUED, REJECTED), created\_by, created\_at / item\_id, qty\_requested, qty\_issued |
| StockCount + StockCountLine | id, store\_id, status (OPEN, SUBMITTED, APPROVED), started\_by, approved\_by? / batch\_id, system\_qty, counted\_qty |
| AuditLog | id, actor\_user\_id?, action, entity, entity\_id, at, ip |

Rules: StockBalance changes only in the same transaction that inserts a StockMovement. Movements are never updated or deleted; corrections are new ADJUSTMENT rows. A transfer writes TRANSFER\_OUT and TRANSFER\_IN in one transaction.

### 5. Architecture

Same Next.js + Postgres pattern. `src/lib/stock.ts` exposes `receive`, `issue`, `transfer`, `dispense`, `returnToSupplier`, `adjust`, `writeOff`; each runs in a transaction and locks the balance rows it touches (`SELECT ... FOR UPDATE`) so two users cannot issue the same last strip. `src/lib/fefo.ts` is a pure function that splits a requested quantity across batches by expiry. The worker computes expiry and low-stock lists nightly and sends the digest. Reports read from SQL views over StockMovement.

### 6. Screens

1. Dashboard: expired value, near-expiry value by band, items below reorder, stock-outs today, recent movements.
2. Items: search, item detail with batches, stock per store, ledger.
3. Receive stock (GRN): invoice header, line rows, scan button; batch and expiry required.
4. Issue / transfer: pick store, add items, FEFO batch split shown, confirm.
5. Indents: ward creates; store inbox to approve and issue.
6. Dispense: quick search, quantity, patient label, print slip.
7. Expiry centre: tabs Expired, 30, 60, 90 days; actions.
8. Reorder list: suggested quantities, CSV / printable list.
9. Stock count: mobile count sheet, variance review, approve.
10. Reports; Admin (stores, users, suppliers, item import, audit log).

### 7. APIs

| Method and path | Purpose | Who |
| --- | --- | --- |
| GET, POST, PATCH /api/items; POST /api/items/import | Item master, import | ADMIN (read: logged in) |
| GET /api/items/:id/ledger | Bin card | logged in |
| POST /api/grn | Receive stock | STOREKEEPER |
| POST /api/issue | Issue or transfer (FEFO) | STOREKEEPER, PHARMACIST |
| POST /api/dispense | Dispense | PHARMACIST |
| POST /api/indents; POST /api/indents/:id/(submit, approve, reject, issue) | Indents | NURSE, STOREKEEPER |
| GET /api/alerts/expiry?days=90&store | Near-expiry with value | logged in |
| GET /api/alerts/low-stock?store | Below reorder | logged in |
| POST /api/counts; PATCH /api/counts/:id; POST /api/counts/:id/approve | Stock count | STOREKEEPER, ADMIN |
| POST /api/writeoff; POST /api/returns | Write-off, return to supplier | ADMIN approves |
| GET /api/reports/(stock, consumption, abc, stockout, expiry) | Reports (?format=csv or pdf) | ADMIN, AUDITOR |
| GET, POST, PATCH /api/admin/(stores, users, suppliers) | Setup | ADMIN |

Errors: `{ error: { code, message } }`; 409 INSUFFICIENT\_STOCK when a balance would go below zero.

### 8. Security and privacy

- Almost no personal data. The optional patient label on dispensing is anonymised after RETENTION\_DAYS, so DPDP Act obligations stay minimal; the dispensing screen shows a one-line notice.
- Financial integrity: append-only ledger, reason + ADMIN approval for adjustments, write-offs and returns, auditor read-only role, audit log of every change.
- bcrypt (cost 12), httpOnly cookies, server role checks, rate limits, security headers, HTTPS via optional Caddy, nightly encrypted backups (14 days).

### 9. Deployment

- Same as the other two: Docker, 2 GB RAM, `cp .env.example .env`, `docker compose up -d`, `docker compose exec app npx prisma db seed`.
- **Single-PC mode** for a small clinic: `DATABASE_URL=file:./stocksafe.db`, `npm run start`, no Docker.
- Seed: about 300 NLEM items, 3 stores, 3 suppliers, 6 months of synthetic movements including some near-expiry and stock-outs, so the demo dashboard looks real.

### 10. Testing and acceptance

- Unit: FEFO split (ties, expired skipped, not enough stock), reorder maths, write-off value, paise maths.
- Property test (fast-check): for any random sequence of movements, the sum of movements per store and batch equals StockBalance and is never negative.
- Concurrency: 20 parallel issues of the last 10 units; total issued never above 10.
- Import: 2,000-row messy CSV (Hindi names, blank rows, bad dates, duplicates) gives a clear row-by-row error report, not a crash.
- End to end: GRN, indent, issue, dispense, expiry alert, write-off, ledger matches.
- **Done means:** all tests pass in CI, clean-machine install works, Hindi works everywhere, Lighthouse 90+ on the landing page.

### 11. Landing page (at `/`)

- **Hero:** "Stop throwing away expired medicines." Sub: "Free, open-source stock and expiry tracker for hospital stores and pharmacies. Know what expires in 90 days and what runs out next week." Buttons: Try the demo, Install free. Visual: expiry centre showing "Rs 42,300 expiring in 60 days" labelled demo data.
- **The problem:** "Monthly hand checks. Paper bin cards. Shelves that go empty without warning." Evidence cards with source links (numbers only once confirmed).
- **How it works:** Receive with batch and expiry, Issue earliest-expiry-first automatically, Get alerts before it is too late.
- **Features grid:** FEFO issuing, expiry alerts, reorder list, ward indents, stock count, barcode scan, reports.
- **Who it is for:** hospital stores, pharmacies, CHCs, nursing homes, NGO clinics.
- **Trust:** "Every movement is recorded and can never be edited, ready for audit."
- **Install** (3 commands), **FAQ** (Does it replace DVDMS? No, it can export to it. Internet needed? No. Free? Yes.), **footer**.
- **Design:** green `#15803D` and white; amber and red only for expiry warnings; tabular numbers for money and quantities.

### 12. Build phases

1. Scaffold, Prisma schema from section 4, Docker Compose (app, worker, postgres), seed skeleton, health page.
2. Auth, roles, stores, suppliers, item master with CSV/Excel import and NLEM seed.
3. `stock.ts` and `fefo.ts` with tests first; GRN with barcode scan; issue, transfer, dispense; ledger; concurrency test.
4. Indents, expiry centre, reorder list, dashboard, stock count.
5. Reports (CSV, PDF), worker alerts and email digest, backups, audit log, retention.
6. Landing page, Hindi for every string, PWA, single-PC SQLite mode.
7. Playwright tests, messy import test, CI, README, ADMIN\_GUIDE.md, demo data, polish.
