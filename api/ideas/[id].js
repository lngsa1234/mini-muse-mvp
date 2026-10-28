/*
 * Vercel Node function: update or delete an idea by id.
 *   PATCH  /api/ideas/:id -> { idea }
 *   DELETE /api/ideas/:id -> { removed }
 */
import { currentUserId } from "../../server/auth.js";
import { handleUpdate, handleDelete } from "../../server/ideas.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const userId = currentUserId(req);
    const id = req.query?.id || req.url.split("?")[0].split("/").pop();
    if (req.method === "PATCH") return send(res, await handleUpdate(userId, id, await readJson(req)));
    if (req.method === "DELETE") return send(res, await handleDelete(userId, id));
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
