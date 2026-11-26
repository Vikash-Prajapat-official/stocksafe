# StockSafe

Free, open-source stock, expiry and reorder tracker for Indian hospital stores and pharmacies. See [SPEC.md](SPEC.md).

**Status:** Phase 1 of 7 (scaffold, schema, Docker, health page).

## Run it

```bash
cp .env.example .env
docker compose up -d
docker compose exec app npx prisma db seed
```

Open http://localhost:3002 (health: http://localhost:3002/health, JSON: `/api/health`).

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
