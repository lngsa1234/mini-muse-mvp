/*
 * Vercel Node function: the server-side agent (ADR-0009) and the user's saved
 * state (ADR-0008). One function for both, because the Hobby plan allows at
 * most 12 serverless functions per deployment.
 *   POST /api/agent/turn (Server-Sent Events), POST /api/agent/answer,
 *   POST /api/agent/cancel, GET /api/agent/tools
 *   GET /api/state, PATCH /api/state, POST /api/state/audit|import, DELETE /api/state/chat
 * vercel.json rewrites /api/agent/:action and /api/state/:action here
 * (?scope=state for the latter) and gives it a long maxDuration: a turn can
 * wait on an approval.
 * Shares server/agent/http.js and server/state.js with the local Express server.
 */
import { handleAgent } from "../server/agent/http.js";
import { currentUserId } from "../server/auth.js";
import { dispatchState } from "../server/state.js";
import { dbStore } from "../server/userdata.js";
import { withTrace } from "../server/trace-node.js";

export const config = { runtime: "nodejs" };

const param = v => (Array.isArray(v) ? v.join("/") : String(v || ""));

export default async function handler(req, res) {
  try {
    const action = param(req.query?.action);
    const body = req.method === "GET" || req.method === "DELETE" ? {} : await readJson(req);
    if (param(req.query?.scope) === "state") {
      const out = await withTrace(`${req.method} /api/state${action ? "/" + action : ""}`, () =>
        dispatchState(dbStore(), { method: req.method, action, userId: currentUserId(req), body }))(req);
      return res.status(out.status).json(out.json);
    }
    await handleAgent(action, req, res, body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e?.message || "server error" });
    else res.end();
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
