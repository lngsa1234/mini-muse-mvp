/*
 * Vercel Node function: observability ingest + viewer.
 *   POST /api/trace                 -> ingest a batch of client spans/logs
 *   GET  /api/trace                 -> list recent traces
 *   GET  /api/trace?id=<traceId>    -> one trace with its spans + logs
 *   GET  /api/trace?view=logs       -> list logs
 *   GET  /api/trace?view=config     -> client tracer config
 * Shares server/trace.js's dispatch with the local Express server. Node runtime
 * is required for the Neon (pg) writes in server/trace-store.js.
 */
import { currentUserId } from "../server/auth.js";
import { dispatch } from "../server/trace.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const out = await dispatch(
      { method: req.method, userId: currentUserId(req), query: req.query || {}, body: await readJson(req) },
      process.env
    );
    return send(res, out);
  } catch (e) {
    return send(res, { status: 500, json: { error: e?.message || "server error" } });
  }
}

const send = (res, { status, json }) => res.status(status).json(json);

async function readJson(req) {
  if (req.method !== "POST") return {};
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
