/*
 * Vercel Node function: open (read) a web page.
 *   POST /api/web/open  -> { title, url, text }
 * Shares server/web.js with the local Express server.
 */
import { handleOpen } from "../../server/web.js";
import { withTrace } from "../../server/trace-node.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, { status: 405, json: { error: "method not allowed" } });
    const body = await readJson(req);
    return send(res, await withTrace("POST /api/web/open", () => handleOpen(body, process.env))(req));
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
