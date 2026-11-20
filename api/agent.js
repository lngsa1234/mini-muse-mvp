/*
 * Vercel Node function: the server-side agent (ADR-0009).
 *   POST /api/agent/turn (Server-Sent Events), POST /api/agent/answer,
 *   POST /api/agent/cancel, GET /api/agent/tools
 * vercel.json rewrites /api/agent/:action to /api/agent?action=:action and
 * gives this function a long maxDuration: a turn can wait on an approval.
 * Shares server/agent/http.js with the local Express server.
 */
import { handleAgent } from "../server/agent/http.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const action = Array.isArray(req.query?.action) ? req.query.action.join("/") : String(req.query?.action || "");
    const body = req.method === "GET" ? {} : await readJson(req);
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
