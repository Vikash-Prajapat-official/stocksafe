// Which database the app is running on. Single-PC mode uses SQLite (DATABASE_URL=file:...); everything else is PostgreSQL.
// Application code is written to work on both; this is only for the few places that genuinely differ.

export const isSqlite = (process.env.DATABASE_URL ?? "").trim().startsWith("file:");

/** Case-insensitive text matching for Prisma `contains`/`equals`: PostgreSQL needs the flag, SQLite's LIKE already ignores ASCII case and rejects it. */
export const ci: { mode?: "insensitive" } = isSqlite ? {} : { mode: "insensitive" };
