import cron from "node-cron";

// Worker skeleton. Nightly expiry/low-stock alerts, email digest and patient-name
// retention are added in Phase 5. For now it only proves the container runs.
function log(msg: string) {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

log("StockSafe worker started");

cron.schedule("0 * * * *", () => log("heartbeat"));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`received ${signal}, exiting`);
    process.exit(0);
  });
}
