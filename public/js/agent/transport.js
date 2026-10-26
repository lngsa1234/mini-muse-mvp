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
  const e = new Error(serverMsg || "Anthropic request failed (" + res.status + ")");
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
  const blocks = []; // ordered content blocks: {type, text} or {type:"tool_use", id, name, _json, input}

  const handle = evt => {
    switch (evt.type) {
      case "content_block_start": {
        const cb = evt.content_block || {};
        if (cb.type === "tool_use") blocks[evt.index] = { type: "tool_use", id: cb.id, name: cb.name, _json: "" };
        else if (cb.type === "text") blocks[evt.index] = { type: "text", text: "" };
        break;
      }
      case "content_block_delta": {
        const d = evt.delta || {};
        const b = blocks[evt.index];
        if (d.type === "text_delta") {
          text += d.text; if (b) b.text += d.text;
          if (onText) try { onText({ text }); } catch (_) {}
        } else if (d.type === "input_json_delta" && b) {
          b._json += d.partial_json || "";
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[evt.index];
        if (b && b.type === "tool_use") {
          try { b.input = b._json ? JSON.parse(b._json) : {}; } catch (_) { b.input = {}; }
        }
        break;
      }
      case "message_delta":
        if (evt.delta && evt.delta.stop_reason) stopReason = evt.delta.stop_reason;
        break;
      case "error":
        throw new Error((evt.error && evt.error.message) || "stream error");
    }
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

  const ordered = blocks.filter(Boolean);
  const toolUses = ordered.filter(b => b.type === "tool_use").map(b => ({ id: b.id, name: b.name, input: b.input || {} }));
  const assistantContent = ordered.map(b =>
    b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input || {} }
                          : { type: "text", text: b.text || "" }
  );
  return { text, toolUses, assistantContent, stopReason };
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
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
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
