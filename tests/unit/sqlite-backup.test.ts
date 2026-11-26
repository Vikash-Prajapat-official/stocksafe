import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { backupSqlite, decrypt, encrypt, restoreSqlite } from "../../scripts/sqlite-backup.mjs";
import { migrate } from "../../scripts/sqlite-migrate.mjs";

const PASS = "a-long-test-passphrase";
const temp = () => mkdtempSync(join(tmpdir(), "stocksafe-"));

function freshDb() {
  const dir = temp();
  const file = join(dir, "live.db");
  migrate(file);
  const sql = new DatabaseSync(file);
  sql.exec(`INSERT INTO "store" ("id","name","type","active") VALUES ('s1','Main store','MAIN',1)`);
  sql.close();
  return { dir, file };
}
const storeNames = (file: string) => {
  const sql = new DatabaseSync(file, { readOnly: true });
  try {
    return (sql.prepare(`SELECT "name" FROM "store" ORDER BY "id"`).all() as { name: string }[]).map((r) => r.name);
  } finally {
    sql.close();
  }
};

describe("SQLite migrations", () => {
  it("are applied once and recorded", () => {
    const { file } = freshDb();
    expect(migrate(file)).toEqual([]); // second run has nothing to do
    const sql = new DatabaseSync(file, { readOnly: true });
    const rows = sql.prepare(`SELECT "name" FROM "_stocksafe_migrations"`).all();
    sql.close();
    expect(rows).toHaveLength(1);
  });

  it("make the ledger append-only and refuse negative balances, like PostgreSQL does", () => {
    const { file } = freshDb();
    const sql = new DatabaseSync(file);
    sql.exec(`INSERT INTO "user" ("id","name","phone","password_hash","role") VALUES ('u1','A','1','x','ADMIN')`);
    sql.exec(`INSERT INTO "item" ("id","name","form","unit") VALUES ('i1','Item','TABLET','tablet')`);
    sql.exec(`INSERT INTO "batch" ("id","item_id","batch_no","expiry_date","mrp_paise","cost_paise") VALUES ('b1','i1','B1',0,1,1)`);
    sql.exec(`INSERT INTO "stock_movement" ("id","seq","type","batch_id","store_id","quantity","actor_user_id","at") VALUES ('m1',1,'RECEIPT','b1','s1',5,'u1',0)`);
    expect(() => sql.exec(`UPDATE "stock_movement" SET "quantity" = 9`)).toThrow(/append-only/);
    expect(() => sql.exec(`DELETE FROM "stock_movement"`)).toThrow(/append-only/);
    expect(() => sql.exec(`INSERT INTO "stock_balance" ("store_id","batch_id","quantity") VALUES ('s1','b1',-1)`)).toThrow(/nonnegative/);
    sql.close();
  });
});

describe("encryption", () => {
  it("round-trips and rejects a wrong passphrase", () => {
    const sealed = encrypt(Buffer.from("hello ledger"), PASS);
    expect(sealed.subarray(0, 8).toString()).toBe("Salted__"); // the openssl layout
    expect(decrypt(sealed, PASS).toString()).toBe("hello ledger");
    expect(() => decrypt(sealed, "another-long-passphrase")).toThrow(/passphrase is wrong/);
    expect(() => decrypt(Buffer.from("not a backup file at all, just text........"), PASS)).toThrow(/not a StockSafe backup/);
  });
});

describe("SQLite backup and restore", () => {
  it("backs up a live database and restores it, keeping the old one aside", async () => {
    const { dir, file } = freshDb();
    const backups = join(dir, "backups");
    const made = await backupSqlite({ file, dir: backups, passphrase: PASS });
    expect(readdirSync(backups)).toEqual([made.file.split(/[\\/]/).pop()]); // no snapshot or .partial left behind
    expect(readFileSync(made.file).includes("Main store")).toBe(false); // encrypted: no plain text inside

    // damage the live database, then restore
    const sql = new DatabaseSync(file);
    sql.exec(`INSERT INTO "store" ("id","name","type","active") VALUES ('s2','Added later','WARD',1)`);
    sql.close();
    const r = restoreSqlite({ backupFile: made.file, file, passphrase: PASS });
    expect(storeNames(file)).toEqual(["Main store"]);
    expect(storeNames(r.kept!)).toEqual(["Main store", "Added later"]);
  });

  it("refuses without a passphrase, with a wrong one, and for a file that is not a backup", async () => {
    const { dir, file } = freshDb();
    await expect(backupSqlite({ file, dir, passphrase: "short" })).rejects.toThrow(/BACKUP_PASSPHRASE/);
    const made = await backupSqlite({ file, dir, passphrase: PASS });
    expect(() => restoreSqlite({ backupFile: made.file, file, passphrase: "wrong-passphrase-here" })).toThrow(/passphrase is wrong/);
    const junk = join(dir, "junk.enc");
    writeFileSync(junk, "just some text that is long enough to pass the length check");
    expect(() => restoreSqlite({ backupFile: junk, file, passphrase: PASS })).toThrow(/not a StockSafe backup/);
    expect(storeNames(file)).toEqual(["Main store"]); // untouched
  });
});
