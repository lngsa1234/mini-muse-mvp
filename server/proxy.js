/*
 * Provider proxy: turns the browser's request into an upstream request.
 * ---------------------------------------------------------------------------
 * Runtime-neutral (no Express, no Node-only APIs) so the same code runs in
 * server/index.js and in the Vercel Edge Function api/llm.js.
 */
import { routeModel } from "./routing.js";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MAX_TOKENS = 2048;

// Returns { error: { status, body } } or { url, init } ready for fetch().
export function buildUpstreamRequest(body, env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: { status: 503, body: { code: "no_api_key", message: "ANTHROPIC_API_KEY is not set on the server." } } };
  }
  // Strip our `tier` field and any client-sent model; pin the model server-side.
  const { tier, model, ...rest } = body || {};
  const payload = Object.assign({}, rest, { model: routeModel(body, env) });
  if (typeof payload.max_tokens !== "number") payload.max_tokens = DEFAULT_MAX_TOKENS;

  return {
    url: ANTHROPIC_URL,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": env.ANTHROPIC_VERSION || "2023-06-01"
      },
      body: JSON.stringify(payload)
    }
  };
}

export const UPSTREAM_UNREACHABLE = { status: 502, body: { code: "upstream_unreachable", message: "Could not reach the Anthropic API." } };

export const health = env => ({ ok: true, hasKey: !!env.ANTHROPIC_API_KEY });
