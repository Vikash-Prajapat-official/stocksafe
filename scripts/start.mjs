// `npm run start`: brings the database up to date (SQLite mode), then starts the production server.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
  const { migrate } = await import("./sqlite-migrate.mjs"); // node:sqlite is only needed in this mode
  const applied = migrate();
  if (applied.length) console.log(`Database updated: ${applied.join(", ")}`);
}
if (!process.env.AUTH_SECRET) {
  console.error("AUTH_SECRET is not set. Copy .env.example to .env and fill it in (the file explains how).");
  process.exit(1);
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "start", "-p", process.env.PORT || "3002"], { stdio: "inherit" });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
