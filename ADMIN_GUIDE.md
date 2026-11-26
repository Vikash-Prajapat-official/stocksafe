# StockSafe admin guide

For the person who installs and looks after StockSafe in a hospital. No programming needed; you will type a few commands.

## 1. Setting it up for real use

1. Put `SEED_DEMO=0` in `.env`, then install as in the [README](README.md). The seed gives you the stores "Main Store", "Pharmacy" and "Ward A", three example suppliers, a starter list of about 430 common medicines and supplies (check it against your own list) and five demo accounts, and **no** demo movements.
2. Sign in as the admin (9000000001, password `ChangeMe@123`) and **change the passwords** of all five accounts (Admin, Users, Edit). Better still, create real users and switch the demo ones off (untick Active). The system always keeps at least one active admin.
3. **Stores** (Admin, Stores): rename or add your stores and wards. Types: Main store, Pharmacy, Ward.
4. **Users** (Admin, Users): one account per person, with a 10-digit mobile number, a role, and the stores they work in. Store keepers, pharmacists and nurses see and change only their own stores. Admins and auditors see all.
5. **Suppliers** (Admin, Suppliers): add the ones you buy from.
6. **Items** (Items, Import CSV / Excel): download the template, fill it in (or paste your Excel list), press **Check file** to see problems row by row without importing, fix them, then **Import**. Items already in the list are skipped, so it is safe to import again. For each item set the **minimum, reorder level and maximum**: the reorder list and low-stock alerts only work for items with a level.
7. Put in your opening stock with **Receive stock** (GRN), one invoice at a time, with batch number and expiry. Or do a first **stock count** and approve it.

## 2. Who does what

| Role | Day to day |
| --- | --- |
| Store keeper | Receive stock (batch and expiry required), issue and transfer, approve ward indents and issue them, count stock |
| Pharmacist | Dispense to patients (FEFO, prints a slip), transfer, works the Expiry list |
| Ward nurse | Raises indents for the ward and watches them |
| Admin | Approves write-offs, returns to supplier, adjustments and stock counts; sets levels; reports; users |
| Auditor | Reads the ledger, reports and audit log. Cannot change anything |

Write-offs, returns and stock-count approvals always need an **admin**, and the admin is recorded as the approver.

## 3. Backups (do this on day one)

**Docker install.** A `backup` container makes an encrypted backup 45 seconds after it starts and every night at 02:00 India time (`BACKUP_HOUR`), keeps 14 days (`BACKUP_KEEP_DAYS`), and checks each file by opening it again. Files are named `stocksafe-YYYYMMDD-HHMMSS.sql.gz.enc` and live in the Docker volume `stocksafe_backups`.

1. Put a strong `BACKUP_PASSPHRASE` (12 or more characters) in `.env`. Without it **backups are off** and the container says so in its log.
2. `docker compose up -d`.
3. Check the **System** page (Admin, System): it shows the latest backup and warns if it is more than a day old.
4. **Copy backups off the machine** regularly (a USB drive, another PC). A backup on the same disk does not survive a dead disk. List the files with `docker compose exec backup ls -l /backups`, copy one out with `docker compose cp backup:/backups/<file> .`.
5. **Keep the passphrase safe, in a second place.** Without it a backup cannot be opened, by anyone.

**Restore** (into a new database, so you can look before you switch over):

```bash
docker compose exec backup /backup/restore.sh /backups/<file> stocksafe_restored
```

To switch the app to the restored database, change the database name in `docker-compose.yml` (`DATABASE_URL` for `app` and `worker`) and run `docker compose up -d`. To go back, change it back. A few spot checks (item ledgers, the expiry list) against the paper records are the proof that a restore is good: try one on a quiet day, before you need it.

**One-PC (SQLite) install.** The app makes the same kind of encrypted backup at 02:30 into `./backups` (change with `BACKUP_DIR`). `npm run db:backup` makes one now. To restore: stop the app, then `npm run db:restore -- backups/<file>`; the previous database is kept next to it as `stocksafe.db.before-restore`. A backup can also be opened by hand: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in <file> | gunzip > stocksafe.db`.

## 4. HTTPS, phones and installing the app

Browsers only allow the **camera** (barcode scanning) and **"install app"** on HTTPS or on `localhost`. On a plain `http://192.168.x.x` address, use a USB barcode scanner (it types into the scan box) or type the codes.

To turn on HTTPS:

1. In `.env` set `SITE_ADDRESS` to the name or address people type, for example `192.168.1.10` or `stocksafe.hospital.local`, and `APP_URL=https://<the same>`.
2. `docker compose --profile https up -d`.
3. Open `https://<that address>`. The certificate is made by the server itself, so each browser shows a warning once. To remove it, install the server's root certificate on each PC and phone: `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt caddy-root.crt`, then open that file on the device and trust it.

Once on HTTPS, a phone's browser offers **Add to Home screen / Install**. The app never stores stock or patient data on the phone: offline it only shows a "you are offline" page.

## 5. Email digest (optional)

Every morning at 06:30 the system can email a short list of what is expired, expiring and low. Set in `.env`: `SMTP_URL` (for example `smtps://user:password@smtp.example.org:465`), `SMTP_FROM`, `DIGEST_TO` (comma-separated addresses), then `docker compose up -d`. The **System** page shows when the last digest went and whether it failed. The digest is sent in English.

## 6. Patient privacy

The dispensing screen has an optional patient name or OPD token. It is stored beside the ledger, not in it, and **cleared automatically after `RETENTION_DAYS`** (default 90) by the nightly job. The ledger itself, which never holds a name, is untouched. The screen shows a one-line notice. Tell staff to enter an OPD token rather than a full name where possible.

## 7. Updating

```bash
git pull
docker compose up -d --build
```

Database changes are applied automatically when the app starts. Your data stays in the Docker volume. Take a backup first. On a one-PC install: `git pull`, `npm install`, `npm run build`, `npm run start`.

## 8. Looking after it

- **Health:** `http://<server>:3002/health` shows App and Database. `docker compose ps` shows the containers; `docker compose logs app` (or `worker`, `backup`) shows what happened.
- **Nightly jobs** (India time): 02:00 clears old patient names, 06:30 works out expiry and low stock and sends the digest. The System page shows when each last ran. Run one by hand: `docker compose exec worker npm run job:alerts`.
- **Expiry bands** are `EXPIRY_ALERT_DAYS` (default 90,60,30).
- **Forgot the admin password:** another admin can reset it in Admin, Users. If there is no other admin, make a new hash and put it in the database:
  ```bash
  docker compose exec app node -e "console.log(require('bcryptjs').hashSync('NewPassword@123', 12))"
  docker compose exec db psql -U stocksafe -d stocksafe -c "UPDATE \"user\" SET password_hash = '<the hash>' WHERE phone = '9000000001'"
  ```
- **Too many failed sign-ins** locks that number for 15 minutes.
- **The ledger cannot be edited**, not even by an admin or with database access: a trigger refuses. A mistake is fixed with an **adjustment** (admin, with a reason), which is itself recorded.
- **Stock-count differences:** an admin approving a count writes adjustment movements for the differences. Counted-versus-system is compared at the moment of approval.

## 9. Before you go live: a checklist

- [ ] Passwords changed; demo users switched off.
- [ ] `BACKUP_PASSPHRASE` set, the System page shows a recent backup, a copy of the passphrase is in a safe place, one backup copied off the machine, and one **restore tried**.
- [ ] Items imported with minimum, reorder and maximum levels.
- [ ] Opening stock received with true batch numbers and expiry dates, or a stock count approved.
- [ ] Staff trained on three things: always enter the batch and expiry from the pack; dispense and issue from the screen (never "borrow" stock without recording it); report a wrong entry to the admin for an adjustment.
- [ ] HTTPS on if phones will scan barcodes.
