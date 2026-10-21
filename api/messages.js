/*
 * Mini Muse backend — Vercel Edge Function
 * -------------------------------------------------------------------------
 * Serverless equivalent of the /api/messages route in server/index.js.
 * It injects ANTHROPIC_API_KEY, pins the model from the client's `tier`,
 * and streams the Anthropic Messages API response straight back to the
 * browser. Runs on the Edge runtime so SSE streaming works without the
 * short default timeout of Node serverless functions.
 *
 * Local development still uses server/index.js (npm run dev). This file is
 * only used when deployed to Vercel.
 */

export const config = { runtime: "edge" };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ code: "no_api_key", message: "ANTHROPIC_API_KEY is not set on the server." }, 503);
  }

  const version = process.env.ANTHROPIC_VERSION || "2023-06-01";
  const MODELS = {
    quick: process.env.MODEL_QUICK || "claude-3-5-haiku-latest",
    default: process.env.MODEL_DEFAULT || "claude-3-7-sonnet-latest"
  };

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Strip our `tier` field and pin the model server-side.
  const { tier, model, ...rest } = body || {};
  const payload = Object.assign({}, rest, {
    model: MODELS[tier === "default" ? "default" : "quick"]
  });
  if (typeof payload.max_tokens !== "number") payload.max_tokens = 2048;

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": version
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return json({ code: "upstream_unreachable", message: "Could not reach the Anthropic API." }, 502);
  }

  // Pipe the (possibly streaming) response straight through to the browser.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" }
  });
}
