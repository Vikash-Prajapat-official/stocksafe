# StockSafe

**Stop throwing away expired medicines.** A free, open-source stock, expiry and reorder tracker for Indian hospital stores and pharmacies. English and Hindi. Runs on a PC with 2 GB of RAM, works without internet on the hospital network, MIT licence.

- **FEFO by default:** issuing always picks the earliest-expiry batch, and expired batches are never issued or dispensed.
- **The ledger is the truth:** every stock change is an append-only movement; balances are derived from it and always match. Nothing in the ledger can be edited or deleted (the database refuses).
- **Expiry centre, reorder list, ward indents, stock counts, barcode scanning (GS1), reports (CSV and PDF), audit log, nightly alerts and an optional email digest.**
- **Audit-ready:** every adjustment, write-off and return has a reason, a user and an admin approval.
- Specification: [SPEC.md](SPEC.md). Design choices: [DECISIONS.md](DECISIONS.md). For whoever runs it: [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## Install (3 commands)

You need [Docker](https://docs.docker.com/get-docker/) and about 2 GB of free memory.

```bash
cp .env.example .env
docker compose up -d
docker compose exec app npx prisma db seed
```

Open <http://localhost:3002> and sign in. The last command adds three stores, three suppliers, about 430 essential medicines (NLEM) and six months of demo movements, so the dashboard looks real (it takes a couple of minutes). For a real hospital put `SEED_DEMO=0` in `.env` first, so you start empty (see the [ADMIN_GUIDE](ADMIN_GUIDE.md)).

Demo accounts (password `ChangeMe@123`; set `SEED_PASSWORD` in `.env` before seeding to change it):

| Role | Phone | Can |
| --- | --- | --- |
| Admin | 9000000001 | everything: users, stores, suppliers, items, approvals, reports |
| Store keeper | 9000000002 | receive stock (GRN), issue and transfer, approve indents, count stock |
| Pharmacist | 9000000003 | dispense, issue, expiry actions |
| Ward nurse | 9000000004 | raise indents for the ward |
| Auditor | 9000000005 | read-only: ledger, reports, audit log |

**Before real use:** change every password, and put a strong `BACKUP_PASSPHRASE` (12+ characters) in `.env`, then `docker compose up -d`. Backups stay off until you do, because a passphrase kept next to its own backups would protect nothing. Keep a copy of the passphrase somewhere safe: without it a backup cannot be opened.

Health: <http://localhost:3002/health>. Phones and the camera barcode scanner need HTTPS: `docker compose --profile https up -d` (see the guide).

### One PC, no Docker (small clinics)

```bash
npm install
# in .env: DATABASE_URL=file:./stocksafe.db   (and BACKUP_PASSPHRASE)
npm run build && npm run db:deploy && npm run db:seed
npm run start
```

Needs Node 22.13 or newer. Same screens, same rules; the data is one file (`prisma/stocksafe.db`), backed up nightly by the app itself.

### A free public demo (Neon + Vercel)

To show StockSafe to a hospital without installing anything, put a sample-data demo online for free: [docs/DEPLOY_DEMO.md](docs/DEPLOY_DEMO.md). The demo is for trying only. Real stock and patient data belong on the hospital's own PC or server.

## Languages

English and हिन्दी everywhere: screens, forms, errors, reports (screen, CSV and PDF). Switch with the button at the top of every page; the choice is remembered.

## Develop

```bash
docker compose up -d db          # PostgreSQL on 127.0.0.1:5434
# .env: DATABASE_URL=postgresql://stocksafe:change-me@localhost:5434/stocksafe
npm install
npx prisma migrate dev
npm run dev                      # http://localhost:3002
```

| Command | What it checks |
| --- | --- |
| `npm run lint` and `npm run typecheck` | style and types (strict) |
| `npm test` | unit tests, no database: FEFO, money, GS1, CSV, reorder maths, the 2,000-row messy import, Hindi message files |
| `npm run test:integration` | the ledger on real PostgreSQL: property tests, 20 parallel issues of the last 10 units, workflows, reports (needs `docker compose up -d db`; uses its own `stocksafe_test` database) |
| `npm run test:sqlite` | the same suites on SQLite |
| `npm run build && npm run test:e2e` | Playwright in a real browser: GRN, indent, issue, dispense, expiry alert, write-off, ledger matches; the messy import; Hindi; installable app; access rules (uses its own `stocksafe_e2e` database; first time run `npx playwright install chromium`) |
| `npm run test:all` | unit, PostgreSQL and SQLite suites |

CI (GitHub Actions) runs all of it, builds the Docker image and checks a clean three-command install.

## How it is built

Next.js 15 (App Router) with TypeScript, Tailwind, Prisma and PostgreSQL 16 (or SQLite for one PC), Auth.js (phone and password, five roles, checked on the server for every request), next-intl, Zod, Vitest, fast-check, Playwright, Docker Compose (app, worker, database, encrypted nightly backup). **All stock changes go through [src/lib/stock.ts](src/lib/stock.ts)**, each in one database transaction that also writes the movement.

Licence: MIT.
