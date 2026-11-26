# Put a free public demo online (Neon + Vercel)

This puts a **demo** of StockSafe on the internet with sample data, for hospitals to try. It costs nothing. It is **not** how a hospital should run StockSafe for real: for real stock and patient data, install it on the hospital's own PC or server (see the [README](../README.md) and the [ADMIN_GUIDE](../ADMIN_GUIDE.md)). Keeping the data on the hospital's own machine is simpler to protect, works without internet, and has no free-tier limits.

You need: a GitHub account (the repo is already public), and free accounts on [neon.tech](https://neon.tech) and [vercel.com](https://vercel.com). About 15 minutes.

## 1. The database (Neon)

1. On neon.tech create a project, for example `stocksafe-demo`. Pick PostgreSQL 16 and the region closest to India (Singapore).
2. On the project page press **Connect**. You need two connection strings; the page shows both, using the "Connection pooling" switch:
   - **Direct** (switch off): the host has no `-pooler` in it. Used once, to load the demo data.
   - **Pooled** (switch on): the host has `-pooler`. Used by the live site.
3. Load the demo data (about 500 KB, six months of sample movements). It is made on your own PC, so nothing slow runs over the internet. If you do not already have the file, make it from the project folder:
   ```bash
   docker compose up -d db
   docker compose exec -T db psql -U stocksafe -d postgres -c "CREATE DATABASE stocksafe_demo"
   DATABASE_URL=postgresql://stocksafe:change-me@localhost:5434/stocksafe_demo npx prisma migrate deploy
   DATABASE_URL=postgresql://stocksafe:change-me@localhost:5434/stocksafe_demo npx tsx prisma/seed.ts
   mkdir -p demo-dump && docker compose exec -T db pg_dump -U stocksafe -d stocksafe_demo --no-owner --no-privileges | gzip -9 > demo-dump/stocksafe-demo.sql.gz
   ```
   Then send it to Neon (needs only Docker; paste your **direct** string inside the quotes):
   ```bash
   gzip -dc demo-dump/stocksafe-demo.sql.gz | docker run --rm -i postgres:16-alpine psql "postgresql://...direct string...?sslmode=require"
   ```
   It should end without errors.

## 2. The website (Vercel)

1. On vercel.com choose **Add New, Project**, and import `Vikash-Prajapat-official/stocksafe` from GitHub. Leave the framework as Next.js and the build settings as they are.
2. Before pressing Deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the **pooled** string from Neon, with `&pgbouncer=true&connection_limit=1` added at the end |
   | `AUTH_SECRET` | a random value: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `AUTH_TRUST_HOST` | `true` |
   | `DEMO_MODE` | `1` (shows a "public demo" banner, lists the demo sign-ins on the login page, and stops anyone changing users or passwords) |
   | `CRON_SECRET` | another random value, 16 or more characters. Vercel then runs the nightly jobs once a day |
   | `RETENTION_DAYS` | `90` (optional) |

3. Press **Deploy**. When it finishes Vercel gives you a link like `https://stocksafe-xxxx.vercel.app`. That is the public demo page: the landing page is at `/`, **Try the demo** goes to the sign-in page, which lists the demo accounts.
4. Optional: in the project's **Settings, Domains** add a name of your own.

## 3. Check it

- Open the link: the landing page, in English and Hindi (button at the top).
- Sign in as the admin from the list on the login page; the dashboard should show expiry values, items below reorder level, and recent movements.
- Open **Reports** and download a **PDF**, and a CSV. (The PDF is the part most likely to need a look on Vercel: it reads fonts from files. If it fails, tell us in an issue.)
- On Vercel, **Settings, Cron Jobs** should list `/api/cron/nightly`.

## What to expect from the free plans

- Neon's free database goes to sleep after a few minutes without use, so the first page after a quiet spell takes a couple of seconds longer. The free storage (0.5 GB) is far more than the demo needs.
- Vercel's free "Hobby" plan allows one cron run a day and is meant for non-commercial projects, which a free open-source demo is.
- The demo is public: **anyone can add or issue stock**, and the ledger can never be edited, so sample data accumulates. Reset it any time: in Neon's **SQL Editor** run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, then load the file again (step 1.3).
- The nightly job clears patient names after 90 days. The demo banner tells visitors not to enter real patient or hospital data; please keep that banner.

## Updating the demo

Pushing to GitHub redeploys it automatically. If a new version changes the database (a new file in `prisma/migrations`), run this once from your PC, with Neon's **direct** string, before or right after the deploy:

```bash
DATABASE_URL="postgresql://...direct string...?sslmode=require" npx prisma migrate deploy
```
