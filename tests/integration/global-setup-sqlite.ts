import { existsSync, unlinkSync } from "node:fs";
import { migrate } from "../../scripts/sqlite-migrate.mjs";
import { sqliteFile } from "../../scripts/sqlite-path.mjs";

/** A fresh SQLite file for every run, with all migrations applied. */
export default async function setup() {
  const file = sqliteFile("file:./stocksafe_test.db"); // prisma/stocksafe_test.db, the same file vitest.integration.sqlite.config.ts points the app at
  // Safety: this deletes a file. Only ever the test database.
  if (!/_test\.db$/.test(file)) throw new Error(`Refusing to reset "${file}": the SQLite test database must be named *_test.db`);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) if (existsSync(file + suffix)) unlinkSync(file + suffix);
  migrate(file);
}
