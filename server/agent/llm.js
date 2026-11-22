/*
 * Server-side model calls for the agent runtime (ADR-0009).
 * ---------------------------------------------------------------------------
 * Same upstream request as the /api/llm proxy (server/proxy.js pins the model
 * from the tier), but called from the server, so the browser never sees the
 * conversation-building or the tool loop.
 *
 *   makeLlm({ env, fetchImpl }) -> { chat(body, { signal, onText }), json(prompt, { tier }) }
 *
 * chat() streams one model turn and returns { text, toolUses, assistantMessage,
 * stopReason, usage }. Tests pass a fake in place of makeLlm().
 */
import { buildUpstreamRequest } from "../proxy.js";
import { routeModel } from "../routing.js";
import { startChildSpan } from "../trace-node.js";
import { SPAN_KIND, capContent } from "../trace-core.js";

export const MAX_TOKENS = 2048;

export class LlmError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

// Map an upstream failure to the codes the browser already knows (public/js/agent/errors.js).
export function errorCode(status, message = "") {
  if (status === 503) return "sampling_disabled";
  if (status === 401) return "session_expired";
  if (status === 403) return "not_granted";
  if (status === 429) return "rate_limited";
  if (status === 400 && /too long|max.*token|exceed|context length/i.test(message)) return "prompt_too_large";
  if (status === 400) return "refused";
  return "upstream_error";
}

async function upstreamError(res) {
  let payload = null;
  try { payload = await res.json(); } catch (_) {}
  const msg = payload?.error?.message || payload?.message || `OpenAI request failed (${res.status})`;
  return new LlmError(msg, errorCode(res.status, msg), res.status);
}

const cancelled = () => Object.assign(new Error("cancelled"), { code: "cancelled" });

// Parse an OpenAI chat-completions SSE stream into text + tool calls.
export async function readStream(body, onText) {
  const dec = new TextDecoder();
  let buf = "", text = "", stopReason = null, usage = null;
  const calls = [];
  const handle = evt => {
    if (evt.error) throw new LlmError(evt.error.message || "stream error", "upstream_error");
    if (evt.usage) usage = evt.usage;
    const choice = evt.choices && evt.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.content) { text += delta.content; if (onText) try { onText(text); } catch (_) {} }
    for (const call of delta.tool_calls || []) {
      const cur = calls[call.index] ||= { id: "", name: "", arguments: "" };
      if (call.id) cur.id = call.id;
      if (call.function?.name) cur.name = call.function.name;
      if (call.function?.arguments) cur.arguments += call.function.arguments;
    }
    if (choice.finish_reason) stopReason = choice.finish_reason;
  };
  for await (const chunk of body) {
    buf += typeof chunk === "string" ? chunk : dec.decode(chunk, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
      const line = raw.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt; try { evt = JSON.parse(data); } catch (_) { continue; }
      handle(evt);
    }
  }
  const ordered = calls.filter(Boolean);
  const toolUses = ordered.map(c => { let input = {}; try { input = c.arguments ? JSON.parse(c.arguments) : {}; } catch (_) {} return { id: c.id, name: c.name, input }; });
  const assistantMessage = {
    role: "assistant",
    content: text || null,
    ...(ordered.length ? { tool_calls: ordered.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) } : {})
  };
  return { text, toolUses, assistantMessage, stopReason, usage };
}

export function makeLlm({ env = process.env, fetchImpl = fetch } = {}) {
  async function post(body, signal) {
    const up = buildUpstreamRequest(body, env);
    if (up.error) throw new LlmError(up.error.body.message, up.error.body.code === "no_api_key" ? "sampling_disabled" : "upstream_error", up.error.status);
    try {
      const res = await fetchImpl(up.url, { ...up.init, signal });
      if (!res.ok) throw await upstreamError(res);
      return res;
    } catch (e) {
      if (e?.name === "AbortError" || signal?.aborted) throw cancelled();
      if (e instanceof LlmError) throw e;
      throw new LlmError("Could not reach the OpenAI API.", "upstream_unreachable", 502);
    }
  }

  return {
    // One streamed model turn. body: { tier, messages, tools }.
    async chat(body, { signal, onText, step = 0 } = {}) {
      const span = startChildSpan("gen_ai.chat", { kind: SPAN_KIND.LLM });
      span?.set({
        "gen_ai.system": "openai", "gen_ai.step": step,
        "gen_ai.request.model": routeModel(body, env), "gen_ai.request.tier": body.tier || "quick",
        "gen_ai.request.message_count": body.messages?.length || 0, "gen_ai.request.tool_count": body.tools?.length || 0
      });
      try {
        const res = await post({ stream: true, stream_options: { include_usage: true }, max_tokens: MAX_TOKENS, ...body }, signal);
        const out = await readStream(res.body, onText);
        span?.set({
          "gen_ai.response.finish_reason": out.stopReason || null,
          "gen_ai.response.tool_call_count": out.toolUses.length,
          "gen_ai.response.content": capContent(out.text),
          ...(out.usage ? { "gen_ai.usage.input_tokens": out.usage.prompt_tokens, "gen_ai.usage.output_tokens": out.usage.completion_tokens, "gen_ai.usage.total_tokens": out.usage.total_tokens } : {})
        }).end("ok");
        return out;
      } catch (e) {
        if (signal?.aborted && e?.code !== "cancelled") { span?.fail(cancelled()); throw cancelled(); }
        span?.fail(e); throw e;
      }
    },

    // One-shot JSON (score_fit). Returns the parsed object.
    async json(prompt, { tier = "default", signal } = {}) {
      const res = await post({ tier, stream: false, max_tokens: 1024, messages: [{ role: "user", content: String(prompt) }] }, signal);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      let raw = (fenced ? fenced[1] : text).trim();
      if (raw[0] !== "[" && raw[0] !== "{") { const m = raw.match(/[\[{][\s\S]*[\]}]/); if (m) raw = m[0]; }
      try { return JSON.parse(raw); } catch (_) { throw new LlmError("The model didn't return valid JSON.", "invalid_json"); }
    }
  };
}
