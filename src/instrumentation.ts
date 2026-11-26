// Runs once when the Next.js server starts. In single-PC (SQLite) mode there is no worker container, so the server
// schedules the nightly jobs itself. With PostgreSQL the worker container does this and nothing happens here.
// The runtime check wraps the import directly so Next leaves the Node-only code out of the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const single = (process.env.DATABASE_URL ?? "").startsWith("file:");
    const live = process.env.NODE_ENV === "production" || process.env.RUN_JOBS_IN_DEV === "1";
    if (single && live) {
      const { startEmbeddedScheduler } = await import("./worker/embedded");
      startEmbeddedScheduler();
    }
  }
}
