/*
 * Vercel Node function: list and create documents.
 *   GET  /api/docs  -> { docs: [...] }
 *   POST /api/docs  -> { doc } (pasted text or an uploaded file)
 * Shares server/docs.js with the local Express server. Node runtime is
 * required for pdf-parse and mammoth.
 */
import { currentUserId } from "../../server/auth.js";
import { handleList, handleCreate } from "../../server/docs.js";

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
