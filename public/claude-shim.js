/*
 * claude-shim.js
 * -------------------------------------------------------------------------
 * Provides the window.claude.use(...) API that Mini Muse expects when it runs
 * inside the Claude.ai artifact sandbox, so the same app can run as a plain
 * web page served by our Node/Express backend.
 *
 *   claude.use("sample") -> a sample() function (+ .json / .limits) that runs
 *                           the tool-use agent loop in the browser and proxies
 *                           raw Anthropic Messages API calls through /api/messages
 *   claude.use("db")     -> null  (app falls back to localStorage)
 *   claude.use("user")   -> null  (app falls back to localStorage)
 *
 * The API key never reaches the browser: the backend injects it.
 */
(() => {
  "use strict";

  const API_URL = "/api/messages";
  const MAX_TOKENS = 2048;
  const MAX_STEPS = 12; // safety cap on tool-use loop iterations

  // Map an HTTP error / payload from the proxy to a code the app understands.
  async function apiError(res) {
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

  function cancelled() { const e = new Error("cancelled"); e.code = "cancelled"; return e; }

  /* ---------- turn the app's loose message list into a valid request ---------- */
  // buildInput() in the app returns [{role:"user", content: <instructions>}, ...chat].
  // We lift the leading instruction block into `system`, drop any leading
  // assistant turns, and merge consecutive same-role string messages.
  function normalize(turns) {
    const arr = Array.isArray(turns) ? turns.slice() : [];
    let system = "";
    if (arr.length && arr[0].role === "user" && typeof arr[0].content === "string") {
      system = arr.shift().content;
    }
    while (arr.length && arr[0].role === "assistant") arr.shift();
    const out = [];
    for (const m of arr) {
      const last = out[out.length - 1];
      if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
        last.content += "\n\n" + m.content;
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    if (!out.length) out.push({ role: "user", content: "Hello" });
    return { system, messages: out };
  }

  function toApiTools(tools) {
    return (tools || []).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: "object", properties: {} }
    }));
  }

  /* ---------- stream one Anthropic turn, parsing the SSE event stream ---------- */
  async function streamTurn(body, signal, onText) {
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

  /* ---------- the sample() the app calls each chat turn ---------- */
  async function sample(turns, opts) {
    opts = opts || {};
    const signal = opts.signal;
    const tier = opts.modelTier === "default" ? "default" : "quick";
    const tools = opts.tools || [];
    const apiTools = toApiTools(tools);

    const { system, messages } = normalize(turns);
    let finalText = "";
    let truncated = false;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal && signal.aborted) throw cancelled();
      const turn = await streamTurn(
        { tier, system, messages, tools: apiTools },
        signal,
        opts.onText
      );
      finalText = turn.text;
      if (turn.stopReason === "max_tokens") truncated = true;

      if (turn.stopReason === "tool_use" && turn.toolUses.length) {
        messages.push({ role: "assistant", content: turn.assistantContent });
        const results = [];
        for (const tu of turn.toolUses) {
          const tool = tools.find(t => t.name === tu.name);
          let content, isError = false;
          if (!tool) { content = "Error: unknown tool " + tu.name; isError = true; }
          else {
            try {
              const out = await tool.execute(tu.input, { signal });
              content = typeof out === "string" ? out : JSON.stringify(out);
            } catch (e) {
              content = "Error: " + (e && e.message ? e.message : String(e));
              isError = true;
            }
          }
          results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      break;
    }
    return { text: finalText, truncated };
  }

  /* ---------- one-shot JSON generation (Ideas / Goals personalization) ---------- */
  sample.json = async (prompt, opts) => {
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
  };

  sample.limits = async () => ({ tools: true });

  window.claude = {
    use: async name => {
      if (name === "sample") return sample;
      return null; // "db" and "user": app falls back to localStorage
    }
  };
})();
