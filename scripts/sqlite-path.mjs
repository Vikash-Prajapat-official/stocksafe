// Where the SQLite file lives. Prisma resolves a relative "file:" URL against the folder of the schema file (prisma/),
// so this does the same, and every script and the app agree on one file.
import { dirname, isAbsolute, resolve } from "node:path";

export function sqliteFile(url = process.env.DATABASE_URL ?? "file:./stocksafe.db") {
  if (!url.startsWith("file:")) throw new Error(`DATABASE_URL must start with "file:" for single-PC mode (got "${url.slice(0, 12)}...")`);
  const raw = decodeURIComponent(url.slice(5).split("?")[0]);
  return isAbsolute(raw) ? raw : resolve("prisma", raw);
}
export { dirname };
