/*
 * Vercel Node function: job search across public job boards.
 *   POST /api/jobs/search  -> { searched, total, jobs: [...], errors }
 * Shares server/jobs.js with the local Express server.
 */
import { handleSearch } from "../../server/jobs.js";
import { withTrace } from "../../server/trace-node.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, { status: 405, json: { error: "method not allowed" } });
    const body = await readJson(req);
    return send(res, await withTrace("POST /api/jobs/search", () => handleSearch(body, process.env))(req));
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
