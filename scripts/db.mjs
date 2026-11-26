// Prepares the database layer for whichever database DATABASE_URL names (run with the .env file loaded).
//   node scripts/db.mjs generate   build the Prisma client (PostgreSQL by default, SQLite when DATABASE_URL starts with "file:")
//   node scripts/db.mjs migrate    bring the database up to date
// SQLite mode and PostgreSQL mode need different generated clients, so switching between them means running
// "npm run build" again.
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const sqlite = url.startsWith("file:");
const run = (c) => {
  console.log(`> ${c}`);
  execSync(c, { stdio: "inherit" });
};

const cmd = process.argv[2];
if (cmd === "generate") {
  if (sqlite) {
    run("node scripts/make-sqlite-schema.mjs");
    run("npx prisma generate --schema prisma/schema.sqlite.prisma");
  } else {
    run("npx prisma generate");
  }
} else if (cmd === "migrate") {
  if (sqlite) {
    const { migrate } = await import("./sqlite-migrate.mjs");
    const applied = migrate();
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  } else {
    run("npx prisma migrate deploy");
  }
} else {
  console.error("Usage: node scripts/db.mjs generate | migrate");
  process.exit(2);
}
