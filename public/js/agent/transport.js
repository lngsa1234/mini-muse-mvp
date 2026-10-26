/*
 * Transport: talks to our backend at /api/llm (never to the provider
 * directly; the server holds the API key and picks the model, see
 * server/routing.js). Parses the SSE stream into text + tool calls.
 */
export const API_URL = "/api/llm";
export const MAX_TOKENS = 2048;

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

/* ---------- stream one model turn, parsing the SSE event stream ---------- */
export async function streamTurn(body, signal, onText) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ stream: true, max_tokens: MAX_TOKENS }, body)),
      signal
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw cancelled();
    const err = new Error("Could not reach the server."); throw err;
  }
  if (!res.ok || !res.body) throw await apiError(res);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let stopReason = null;
  const toolCalls = [];

  const handle = evt => {
    if (evt.error) throw new Error(evt.error.message || "stream error");
    const choice = evt.choices && evt.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.content) {
      text += delta.content;
      if (onText) try { onText({ text }); } catch (_) {}
    }
    for (const call of delta.tool_calls || []) {
      const current = toolCalls[call.index] ||= { id: "", name: "", arguments: "" };
      if (call.id) current.id = call.id;
      if (call.function?.name) current.name = call.function.name;
      if (call.function?.arguments) current.arguments += call.function.arguments;
    }
    if (choice.finish_reason) stopReason = choice.finish_reason;
  };

  while (true) {
    let chunk;
    try { chunk = await reader.read(); }
    catch (e) { if (e && e.name === "AbortError") throw cancelled(); throw e; }
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
      const dataLine = raw.split("\n").find(l => l.startsWith("data:"));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt; try { evt = JSON.parse(data); } catch (_) { continue; }
      handle(evt);
    }
  }

  const ordered = toolCalls.filter(Boolean);
  const toolUses = ordered.map(call => {
    let input = {};
    try { input = call.arguments ? JSON.parse(call.arguments) : {}; } catch (_) {}
    return { id: call.id, name: call.name, input };
  });
  const assistantMessage = {
    role: "assistant",
    content: text || null,
    ...(ordered.length ? { tool_calls: ordered.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) } : {})
  };
  return { text, toolUses, assistantMessage, stopReason };
}

/* ---------- one-shot JSON generation (Ideas / Goals personalization) ---------- */
export async function completeJson(prompt, opts) {
  opts = opts || {};
  const tier = opts.modelTier === "default" ? "default" : "quick";
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier, stream: false, max_tokens: 1024, messages: [{ role: "user", content: String(prompt) }] })
    });
  } catch (e) { throw new Error("Could not reach the server."); }
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = (fenced ? fenced[1] : text).trim();
  // Fall back to the outermost JSON array/object if there's surrounding prose.
  if (raw[0] !== "[" && raw[0] !== "{") {
    const m = raw.match(/[\[{][\s\S]*[\]}]/);
    if (m) raw = m[0];
  }
  try { return JSON.parse(raw); }
  catch (e) { const err = new Error("invalid json"); err.code = "invalid_json"; throw err; }
}
