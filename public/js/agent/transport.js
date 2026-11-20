/*
 * Transport: one-shot JSON generations (Ideas / Goals suggestions) through our
 * backend at /api/llm (never the provider directly; the server holds the API
 * key and picks the model, see server/routing.js). Chat turns no longer come
 * through here: the agent loop runs on the server (agent/run.js, ADR-0009).
 */
import { cap, activeTraceparent, startTrace, setActive, flush } from "../core/trace.js";

export const API_URL = "/api/llm";

// Build request headers, attaching the active span's traceparent so the
// server's openai.chat span joins this turn's trace.
function llmHeaders(span) {
  const h = { "content-type": "application/json" };
  const tp = span ? span.traceparent() : activeTraceparent();
  if (tp) h.traceparent = tp;
  return h;
}

// Map an HTTP error / payload from the proxy to a code the app understands (agent/errors.js).
export async function apiError(res) {
  let payload = null;
  try { payload = await res.json(); } catch (_) {}
  const serverCode = payload && (payload.code || (payload.error && payload.error.code));
  const serverMsg = payload && (payload.message || (payload.error && payload.error.message));
  let code;
  if (serverCode === "no_api_key") code = "sampling_disabled";
  else if (res.status === 401) code = "session_expired";
  else if (res.status === 403) code = "not_granted";
  else if (res.status === 429) code = "rate_limited";
  else if (res.status === 400 && /too long|max.*token|exceed/i.test(serverMsg || "")) code = "prompt_too_large";
  else if (res.status === 400) code = "refused";
  const e = new Error(serverMsg || "OpenAI request failed (" + res.status + ")");
  if (code) e.code = code;
  return e;
}

export function cancelled() { const e = new Error("cancelled"); e.code = "cancelled"; return e; }

/* ---------- one-shot JSON generation (Ideas / Goals personalization) ---------- */
// Each call is its own root trace (gen_ai.generate): the server's openai.chat
// span joins it, so these personalization prompts/outputs are captured too.
export async function completeJson(prompt, opts) {
  opts = opts || {};
  const tier = opts.modelTier === "default" ? "default" : "quick";
  const span = startTrace("gen_ai.generate", {
    rootKind: "generate",
    kind: "llm",
    attributes: { "gen_ai.request.tier": tier, "gen_ai.prompt": cap(String(prompt)) }
  });
  const prevActive = setActive(span);
  try {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: llmHeaders(span),
        body: JSON.stringify({ tier, stream: false, max_tokens: 1024, messages: [{ role: "user", content: String(prompt) }] })
      });
    } catch (e) { const err = new Error("Could not reach the server."); span.fail(err); throw err; }
    if (!res.ok) { const e = await apiError(res); span.fail(e); throw e; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const usage = data.usage;
    span.set({
      "gen_ai.response.content": cap(text),
      ...(usage ? {
        "gen_ai.usage.input_tokens": usage.prompt_tokens,
        "gen_ai.usage.output_tokens": usage.completion_tokens,
        "gen_ai.usage.total_tokens": usage.total_tokens
      } : {})
    });
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    let raw = (fenced ? fenced[1] : text).trim();
    // Fall back to the outermost JSON array/object if there's surrounding prose.
    if (raw[0] !== "[" && raw[0] !== "{") {
      const m = raw.match(/[\[{][\s\S]*[\]}]/);
      if (m) raw = m[0];
    }
    try { const parsed = JSON.parse(raw); span.end("ok"); return parsed; }
    catch (e) { const err = new Error("invalid json"); err.code = "invalid_json"; span.fail(err); throw err; }
  } finally {
    setActive(prevActive);
    flush();
  }
}
