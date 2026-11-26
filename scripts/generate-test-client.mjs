// Generates a second Prisma client, for SQLite, into node_modules/.prisma/client-sqlite, so the SQLite test run does not
// disturb the PostgreSQL client the rest of the project uses.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.sqlite.prisma", "utf8").replace(
  /generator client \{/,
  'generator client {\n  output = "../node_modules/.prisma/client-sqlite"',
);
writeFileSync("prisma/.schema.sqlite.test.prisma", schema);
try {
  execSync("npx prisma generate --schema prisma/.schema.sqlite.test.prisma", { stdio: "inherit" });
} finally {
  // the temporary schema is not needed once generated
  writeFileSync("prisma/.schema.sqlite.test.prisma", "// temporary\n");
}
