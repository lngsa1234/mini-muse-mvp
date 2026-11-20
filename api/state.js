/*
 * Vercel Node function: user state + chat history (ADR-0008).
 *   GET /api/state, PATCH /api/state, POST /api/state/audit|import, DELETE /api/state/chat
 * vercel.json rewrites /api/state/:action to /api/state?action=:action.
 * Shares server/state.js with the local Express server.
 */
import { currentUserId } from "../server/auth.js";
import { dispatchState } from "../server/state.js";
import { dbStore } from "../server/userdata.js";
import { withTrace } from "../server/trace-node.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || "");
    const body = req.method === "GET" || req.method === "DELETE" ? {} : await readJson(req);
    const out = await withTrace(`${req.method} /api/state${action ? "/" + action : ""}`, () =>
      dispatchState(dbStore(), { method: req.method, action, userId: currentUserId(req), body }))(req);
    return res.status(out.status).json(out.json);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
