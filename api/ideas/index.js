/*
 * Vercel Node function: list and create ideas.
 *   GET  /api/ideas  -> { ideas: [...] }
 *   POST /api/ideas  -> { idea }
 * Shares server/ideas.js with the local Express server.
 */
import { currentUserId } from "../../server/auth.js";
import { handleList, handleCreate } from "../../server/ideas.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const userId = currentUserId(req);
    if (req.method === "GET") return send(res, await handleList(userId));
    if (req.method === "POST") return send(res, await handleCreate(userId, await readJson(req)));
    return send(res, { status: 405, json: { error: "method not allowed" } });
  } catch (e) {
    return send(res, { status: 500, json: { error: e?.message || "server error" } });
  }
}

const send = (res, { status, json }) => res.status(status).json(json);

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
