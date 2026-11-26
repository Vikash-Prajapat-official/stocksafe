// `npm run start`: brings the database up to date (SQLite mode), then starts the production server.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
  const { migrate } = await import("./sqlite-migrate.mjs"); // node:sqlite is only needed in this mode
  const applied = migrate();
  if (applied.length) console.log(`Database updated: ${applied.join(", ")}`);
}
// The session-signing secret. If .env does not give one, make a random one the first time and keep it (STATE_DIR, default
// ./data, a Docker volume), so a fresh install needs no editing and sessions survive restarts.
if (!process.env.AUTH_SECRET) {
  const dir = process.env.STATE_DIR || "data";
  const file = `${dir}/auth-secret`;
  mkdirSync(dir, { recursive: true });
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
    console.log(`Created a session secret in ${file}`);
  }
  process.env.AUTH_SECRET = readFileSync(file, "utf8").trim();
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "start", "-p", process.env.PORT || "3002"], { stdio: "inherit" });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
