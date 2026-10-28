/*
 * Initialise the Neon database: create tables, the dev user, and seed the
 * example document every fresh install used to start with. Idempotent.
 * Run with: npm run db:init
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { listDocs, createDoc } from "../server/db.js";
import { DEV_USER_ID } from "../server/auth.js";

const EXAMPLE_TITLE = "Learning circle notes";
const EXAMPLE_TEXT =
  "Agent engineering learning circle.\n\nWe meet on Wednesday evenings. Sessions run 90 minutes: 15 minutes of check-ins, 45 minutes of hands-on building, 30 minutes of show and tell.\n\nSession plan: Session 1 covers the agent loop and why tools matter. Session 2: everyone adds a tool and writes a clear description for it. Session 3: safety, approvals and prompt injection. Session 4: memory and background work, then demos.\n\nGround rules: no question is too basic. Pair beginners with someone who has built an agent before. Share your screen when you get stuck.\n\nOpen questions: should we move to a bigger room once the waitlist clears? Who wants to host the demo night?";

async function main() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(path.join(dir, "..", "db", "schema.sql"), "utf8");

  // The HTTP neon() driver only runs tagged-template queries, so use a Pool
  // (a pg-style client) to execute the raw DDL statements and the dev-user seed.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const statements = schema.split(";").map(x => x.trim()).filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);
    console.log(`Applied ${statements.length} schema statement(s).`);

    await pool.query("insert into users (id) values ($1) on conflict (id) do nothing", [DEV_USER_ID]);
    console.log(`Dev user ready: ${DEV_USER_ID}`);
  } finally {
    await pool.end();
  }

  const docs = await listDocs(DEV_USER_ID);
  if (!docs.length) {
    await createDoc(DEV_USER_ID, { title: EXAMPLE_TITLE, text: EXAMPLE_TEXT, isExample: true });
    console.log("Seeded example document.");
  } else {
    console.log(`Documents already present (${docs.length}); skipping seed.`);
  }

  console.log("Database ready.");
}

main().catch(e => { console.error("db:init failed:", e.message); process.exit(1); });
