# StockSafe

Free, open-source stock, expiry and reorder tracker for Indian hospital stores and pharmacies. See [SPEC.md](SPEC.md).

**Status:** Phase 2 of 7 (auth, roles, stores, suppliers, item master with CSV/Excel import, NLEM seed).

## Run it

```bash
cp .env.example .env
# put a random value after AUTH_SECRET= in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
docker compose up -d
docker compose exec app npx prisma db seed
```

Open http://localhost:3002 and sign in. Demo accounts (password `ChangeMe@123`, change it in `.env` via `SEED_PASSWORD` before seeding):

| Role | Phone |
| --- | --- |
| Admin | 9000000001 |
| Store keeper | 9000000002 |
| Pharmacist | 9000000003 |
| Ward nurse | 9000000004 |
| Auditor | 9000000005 |

Health: http://localhost:3002/health (JSON: `/api/health`).

## Develop without Docker for the app

```bash
docker compose up -d db          # Postgres on 127.0.0.1:5434
# in .env set DATABASE_URL=postgresql://stocksafe:change-me@localhost:5434/stocksafe
npm install
npx prisma migrate dev
npm run dev                      # http://localhost:3002
npm run typecheck && npm run lint && npm test
```

Design choices are logged in [DECISIONS.md](DECISIONS.md). Licence: MIT.
