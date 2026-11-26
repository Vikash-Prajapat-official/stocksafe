// Backup and restore for single-PC (SQLite) mode.
//   node scripts/sqlite-backup.mjs backup              one encrypted backup now
//   node scripts/sqlite-backup.mjs restore <file>      put a backup back (the current database is kept as *.before-restore)
// File format: stocksafe-YYYYmmdd-HHMMSS.db.gz.enc = the database file, gzipped, then encrypted with AES-256-CBC,
// key from BACKUP_PASSPHRASE through PBKDF2-SHA256 (200,000 rounds). It is the same layout `openssl enc -pbkdf2` writes, so
// it can also be opened by hand:  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in FILE | gunzip > stocksafe.db
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { sqliteFile } from "./sqlite-path.mjs";

const ITER = 200_000;
const MAGIC = Buffer.from("Salted__");
const NAME = /^stocksafe-\d{8}-\d{6}\.db\.gz\.enc$/;

export const backupDir = () => resolve(process.env.BACKUP_DIR?.trim() || "backups");

function keyAndIv(passphrase, salt) {
  const k = pbkdf2Sync(passphrase, salt, ITER, 48, "sha256");
  return { key: k.subarray(0, 32), iv: k.subarray(32, 48) };
}

export function encrypt(plain, passphrase) {
  const salt = randomBytes(8);
  const { key, iv } = keyAndIv(passphrase, salt);
  const c = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([MAGIC, salt, c.update(plain), c.final()]);
}

export function decrypt(data, passphrase) {
  if (data.length < 32 || !data.subarray(0, 8).equals(MAGIC)) throw new Error("This is not a StockSafe backup file.");
  const { key, iv } = keyAndIv(passphrase, data.subarray(8, 16));
  try {
    const d = createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([d.update(data.subarray(16)), d.final()]);
  } catch {
    throw new Error("Could not open the backup: the passphrase is wrong, or the file is damaged.");
  }
}

const stamp = () => {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const d = new Date();
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Takes a consistent snapshot of the live database (safe while the app is running), encrypts and checks it. */
export async function backupSqlite({ file = sqliteFile(), dir = backupDir(), passphrase = process.env.BACKUP_PASSPHRASE, keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14 } = {}) {
  if (!passphrase || passphrase.length < 12) throw new Error("BACKUP_PASSPHRASE is not set (at least 12 characters), so no backup was made.");
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.snapshot-${process.pid}-${Date.now()}.db`);
  const src = new DatabaseSync(file, { readOnly: true });
  try {
    await sqliteBackup(src, tmp);
  } finally {
    src.close();
  }
  try {
    const snapshot = readFileSync(tmp);
    const sealed = encrypt(gzipSync(snapshot, { level: 9 }), passphrase);
    // prove it opens again and matches before keeping it
    if (!gunzipSync(decrypt(sealed, passphrase)).equals(snapshot)) throw new Error("backup check failed: the file does not match the database");
    const final = join(dir, `stocksafe-${stamp()}.db.gz.enc`);
    writeFileSync(final + ".partial", sealed, { mode: 0o600 });
    renameSync(final + ".partial", final);
    prune(dir, keepDays);
    return { file: final, bytes: sealed.length };
  } finally {
    unlinkSync(tmp);
  }
}

function prune(dir, keepDays) {
  const limit = Date.now() - keepDays * 86_400_000;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if ((NAME.test(n) || n.endsWith(".partial")) && statSync(p).mtimeMs < limit) unlinkSync(p);
  }
}

/** Replaces the database with the backup. Stop the app first. The old database is kept next to it as *.before-restore. */
export function restoreSqlite({ backupFile, file = sqliteFile(), passphrase = process.env.BACKUP_PASSPHRASE }) {
  if (!passphrase) throw new Error("BACKUP_PASSPHRASE is not set, so the backup cannot be opened.");
  if (!existsSync(backupFile)) throw new Error(`Backup file not found: ${backupFile}`);
  const db = gunzipSync(decrypt(readFileSync(backupFile), passphrase));
  if (db.subarray(0, 15).toString() !== "SQLite format 3") throw new Error("The backup opened, but it does not contain a SQLite database.");
  mkdirSync(dirname(file), { recursive: true });
  let kept = null;
  if (existsSync(file)) {
    kept = `${file}.before-restore`;
    copyFileSync(file, kept);
  }
  // a stale write-ahead log from the old database would corrupt the restored one
  for (const s of ["-wal", "-shm"]) if (existsSync(file + s)) unlinkSync(file + s);
  writeFileSync(file, db);
  return { file, kept, name: basename(backupFile) };
}

if (process.argv[1]?.endsWith("sqlite-backup.mjs")) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === "backup") {
      const r = await backupSqlite();
      console.log(`Backup written: ${r.file} (${r.bytes} bytes)`);
    } else if (cmd === "restore" && arg) {
      const r = restoreSqlite({ backupFile: resolve(arg) });
      console.log(`Restored ${r.name} into ${r.file}.${r.kept ? ` The previous database was kept as ${r.kept}.` : ""}`);
    } else {
      console.error("Usage: node scripts/sqlite-backup.mjs backup | restore <backup-file>");
      process.exit(2);
    }
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    process.exit(1);
  }
}
