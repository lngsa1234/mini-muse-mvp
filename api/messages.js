/*
 * Mini Muse backend — Vercel Edge Function
 * -------------------------------------------------------------------------
 * Serverless equivalent of the /api/messages route in server/index.js; both
 * share server/proxy.js and server/routing.js. Runs on the Edge runtime so
 * SSE streaming works without the short default timeout of Node serverless
 * functions.
 */
import { buildUpstreamRequest, UPSTREAM_UNREACHABLE } from "../server/proxy.js";

export const config = { runtime: "edge" };

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const up = buildUpstreamRequest(body, process.env);
  if (up.error) return json(up.error.body, up.error.status);

  let upstream;
  try {
    upstream = await fetch(up.url, up.init);
  } catch {
    return json(UPSTREAM_UNREACHABLE.body, UPSTREAM_UNREACHABLE.status);
  }

  // Pipe the (possibly streaming) response straight through to the browser.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" }
  });
}
