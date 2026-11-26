// Applies prisma/sqlite-migrations/*.sql, in name order, to the SQLite file named by DATABASE_URL. Each file runs once,
// inside a transaction, and is recorded in _stocksafe_migrations. Safe to run on every start.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { sqliteFile } from "./sqlite-path.mjs";

export function migrate(file = sqliteFile(), dir = "prisma/sqlite-migrations") {
  mkdirSync(dirname(file), { recursive: true });
  const sql = new DatabaseSync(file);
  try {
    sql.exec("PRAGMA journal_mode = WAL");
    sql.exec("PRAGMA foreign_keys = ON");
    sql.exec(`CREATE TABLE IF NOT EXISTS "_stocksafe_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL)`);
    const done = new Set(sql.prepare(`SELECT "name" FROM "_stocksafe_migrations"`).all().map((r) => r.name));
    const applied = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      sql.exec("BEGIN");
      try {
        sql.exec(readFileSync(`${dir}/${f}`, "utf8"));
        sql.prepare(`INSERT INTO "_stocksafe_migrations" ("name", "applied_at") VALUES (?, ?)`).run(f, new Date().toISOString());
        sql.exec("COMMIT");
        applied.push(f);
      } catch (e) {
        sql.exec("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
    return applied;
  } finally {
    sql.close();
  }
}

if (process.argv[1]?.endsWith("sqlite-migrate.mjs")) {
  const applied = migrate();
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
}
