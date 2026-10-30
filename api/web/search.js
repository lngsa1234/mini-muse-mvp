/*
 * Vercel Node function: web search.
 *   POST /api/web/search  -> { results: [{ title, url, snippet }] }
 * Shares server/web.js with the local Express server.
 */
import { handleSearch } from "../../server/web.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, { status: 405, json: { error: "method not allowed" } });
    return send(res, await handleSearch(await readJson(req), process.env));
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
