/*
 * Retention purge: delete traces, spans and logs older than OBS_RETENTION_DAYS
 * (default 7). Run periodically (cron / scheduled job) or by hand:
 *   npm run obs:purge            # uses OBS_RETENTION_DAYS from .env
 *   npm run obs:purge -- 30      # override: keep 30 days
 */
import "dotenv/config";
import { purgeOlderThan } from "../server/trace-store.js";

const arg = Number(process.argv[2]);
const envDays = Number(process.env.OBS_RETENTION_DAYS);
const days = Number.isFinite(arg) ? arg : Number.isFinite(envDays) ? envDays : 7;

if (!process.env.DATABASE_URL) {
  console.error("obs:purge skipped: DATABASE_URL is not set.");
  process.exit(0);
}

purgeOlderThan(days)
  .then(({ traces, spans, logs, cutoff }) => {
    console.log(`Purged observability data older than ${days} day(s) (before ${cutoff}):`);
    console.log(`  traces: ${traces}  spans: ${spans}  logs: ${logs}`);
  })
  .catch(e => { console.error("obs:purge failed:", e.message); process.exit(1); });
